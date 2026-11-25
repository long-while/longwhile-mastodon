import {
  apiCreateBookmarkFolder,
  apiDeleteBookmarkFolder,
  apiGetBookmarkFolders,
  apiGetBookmarkFolderStatuses,
  apiRenameBookmarkFolder,
  apiReorderBookmarkFolders,
  apiSetStatusBookmarkFolders,
} from 'mastodon/api/bookmark_folders';
import { createDataLoadingThunk } from 'mastodon/store/typed_functions';

import { importFetchedStatuses } from './importer';
import { bookmarkSuccess } from './interactions';

export const bookmarkFolderListKey = (folderId: string) =>
  `bookmarks:${folderId}` as const;

export const fetchBookmarkFolders = createDataLoadingThunk(
  'bookmark_folders/fetch',
  () => apiGetBookmarkFolders(),
);

export const createBookmarkFolder = createDataLoadingThunk(
  'bookmark_folders/create',
  ({ name }: { name: string }) => apiCreateBookmarkFolder(name),
);

export const renameBookmarkFolder = createDataLoadingThunk(
  'bookmark_folders/rename',
  ({ id, name }: { id: string; name: string }) =>
    apiRenameBookmarkFolder(id, name),
);

export const deleteBookmarkFolder = createDataLoadingThunk(
  'bookmark_folders/delete',
  async ({ id }: { id: string }) => {
    await apiDeleteBookmarkFolder(id);
    return { id };
  },
);

export const reorderBookmarkFolders = createDataLoadingThunk(
  'bookmark_folders/reorder',
  ({ folderIds }: { folderIds: string[] }) =>
    apiReorderBookmarkFolders(folderIds),
);

export const fetchBookmarkFolderStatuses = createDataLoadingThunk(
  'bookmark_folders/fetch_statuses',
  ({ folderId, url }: { folderId: string; url?: string }) =>
    apiGetBookmarkFolderStatuses(folderId, url),
  ({ statuses, next }, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses(statuses));

    return {
      folderId: actionArg.folderId,
      statusIds: statuses.map((status) => status.id),
      next,
      append: !!actionArg.url,
    };
  },
);

export const setStatusBookmarkFolders = createDataLoadingThunk(
  'bookmark_folders/set_status',
  ({ statusId, folderIds }: { statusId: string; folderIds: string[] }) =>
    apiSetStatusBookmarkFolders(statusId, folderIds),
  ({ folder_ids, status }, { dispatch, getState }) => {
    const wasBookmarked = getState().statuses.getIn([status.id, 'bookmarked']);

    dispatch(importFetchedStatuses([status]));

    if (status.bookmarked && !wasBookmarked) {
      dispatch(bookmarkSuccess(getState().statuses.get(status.id)));
    }

    return { statusId: status.id, folderIds: folder_ids };
  },
);
