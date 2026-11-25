import { defineMessages } from 'react-intl';

import { apiGetBookmarkDetails } from 'mastodon/api/bookmark_folders';
import type { ApiBookmarkDetailJSON } from 'mastodon/api_types/bookmark_folders';
import type { Alert } from 'mastodon/models/alert';
import type { Status } from 'mastodon/models/status';
import type { AppDispatch, GetState } from 'mastodon/store';

import { dismissAlert, showAlert } from './alerts';
import { setStatusBookmarkFolders } from './bookmark_folders';
import { fetchBookmarkDetails, setBookmarkNote } from './bookmark_list';
import {
  bookmark as requestBookmark,
  unbookmark as requestUnbookmark,
  unbookmarkRequest,
} from './interactions';
import { openModal } from './modal';

export const DETAILS_TIMEOUT_MS = 1500;

const messages = defineMessages({
  bookmarked: { id: 'bookmark_toast.bookmarked', defaultMessage: 'Bookmarked' },
  addToFolder: {
    id: 'bookmark_toast.add_to_folder',
    defaultMessage: 'Add to folder',
  },
  unbookmarked: {
    id: 'bookmark_toast.unbookmarked',
    defaultMessage: 'Bookmark removed',
  },
  unbookmarkedWithFolders: {
    id: 'bookmark_toast.unbookmarked_with_folders',
    defaultMessage:
      'Bookmark removed. It was also taken out of {count, plural, one {# folder} other {# folders}}',
  },
  undo: { id: 'bookmark_toast.undo', defaultMessage: 'Undo' },
  undoFailed: {
    id: 'bookmark_toast.undo_failed',
    defaultMessage: 'Could not restore the bookmark',
  },
});

interface RestoreInfo {
  folderIds: string[];
  note: string;
}

type Thunk = (dispatch: AppDispatch, getState: GetState) => Promise<void>;

let currentToast: { token: number; key: number | null } = {
  token: 0,
  key: null,
};

const isLive = (getState: GetState, token: number) =>
  currentToast.token === token &&
  currentToast.key !== null &&
  getState().alerts.some((alert) => alert.key === currentToast.key);

const claimToast = (
  dispatch: AppDispatch,
  getState: GetState,
  token: number,
) => {
  if (!isLive(getState, token) || currentToast.key === null) return false;

  dispatch(dismissAlert({ key: currentToast.key }));
  currentToast = { token: currentToast.token, key: null };
  return true;
};

const replaceToast = (
  dispatch: AppDispatch,
  getState: GetState,
  build: (token: number) => Omit<Alert, 'key'>,
) => {
  if (currentToast.key !== null) {
    dispatch(dismissAlert({ key: currentToast.key }));
  }

  const token = currentToast.token + 1;

  dispatch(showAlert(build(token)));
  currentToast = { token, key: getState().alerts.at(-1)?.key ?? null };
};

const toRestoreInfo = (
  details: ApiBookmarkDetailJSON[],
  statusId: string,
): RestoreInfo => {
  const detail = details.find((item) => item.status_id === statusId);

  return { folderIds: detail?.folder_ids ?? [], note: detail?.note ?? '' };
};

const readRestoreInfo = async (
  statusId: string,
): Promise<RestoreInfo | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
    }, DETAILS_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      apiGetBookmarkDetails([statusId]).then((details) =>
        toRestoreInfo(details, statusId),
      ),
      timeout,
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const showBookmarkedToast = (
  dispatch: AppDispatch,
  getState: GetState,
  statusId: string,
) => {
  replaceToast(dispatch, getState, (token) => ({
    message: messages.bookmarked,
    action: messages.addToFolder,
    onClick: () => {
      if (!claimToast(dispatch, getState, token)) return;

      dispatch(
        openModal({
          modalType: 'BOOKMARK_FOLDER_ADDER',
          modalProps: { statusId },
        }),
      );
    },
  }));
};

const recreateBookmark =
  (status: Status, folderIds: string[]): Thunk =>
  async (dispatch, getState) => {
    const statusId = status.get('id') as string;

    if (folderIds.length > 0) {
      const arg = { statusId, folderIds, skipAlert: true };
      await dispatch(setStatusBookmarkFolders(arg)).unwrap();
      return;
    }

    const current = getState().statuses.get(statusId) ?? status;
    const ok = await dispatch(requestBookmark(current, { skipAlert: true }));

    if (!ok) throw new Error(`re-bookmark of ${statusId} failed`);
  };

const restoreBookmark =
  (status: Status, restore: RestoreInfo | null): Thunk =>
  async (dispatch) => {
    const statusId = status.get('id') as string;

    try {
      await dispatch(recreateBookmark(status, restore?.folderIds ?? []));

      if (restore?.note) {
        const arg = { statusId, note: restore.note, skipAlert: true };
        await dispatch(setBookmarkNote(arg)).unwrap();
      } else {
        void dispatch(
          fetchBookmarkDetails({ statusIds: [statusId], skipAlert: true }),
        );
      }
    } catch (error) {
      console.error('Failed to undo unbookmark', { statusId, error });
      dispatch(showAlert({ message: messages.undoFailed }));
    }
  };

const showUnbookmarkedToast = (
  dispatch: AppDispatch,
  getState: GetState,
  status: Status,
  restore: RestoreInfo | null,
) => {
  const count = restore?.folderIds.length ?? 0;

  replaceToast(dispatch, getState, (token) => ({
    message:
      count > 0 ? messages.unbookmarkedWithFolders : messages.unbookmarked,
    values: { count },
    action: messages.undo,
    onClick: () => {
      if (!claimToast(dispatch, getState, token)) return;

      void dispatch(restoreBookmark(status, restore));
    },
  }));
};

export const bookmarkStatus =
  (status: Status): Thunk =>
  async (dispatch, getState) => {
    const ok = await dispatch(requestBookmark(status));

    if (!ok) return;

    showBookmarkedToast(dispatch, getState, status.get('id') as string);
  };

export const unbookmarkStatus =
  (status: Status): Thunk =>
  async (dispatch, getState) => {
    const statusId = status.get('id') as string;

    dispatch(unbookmarkRequest(status));

    const restore = await readRestoreInfo(statusId);

    if (getState().statuses.getIn([statusId, 'bookmarked'])) return;

    const ok = await dispatch(requestUnbookmark(status));

    if (!ok) return;

    showUnbookmarkedToast(dispatch, getState, status, restore);
  };

export const toggleStatusBookmark = (status: Status): Thunk =>
  status.get('bookmarked') ? unbookmarkStatus(status) : bookmarkStatus(status);
