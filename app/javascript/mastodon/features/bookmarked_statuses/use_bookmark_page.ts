import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from 'react-intl';

import { isFulfilled } from '@reduxjs/toolkit';
import { List as ImmutableList } from 'immutable';

import { showAlert } from 'mastodon/actions/alerts';
import { fetchBookmarkFolders } from 'mastodon/actions/bookmark_folders';
import type { ChunkedResult } from 'mastodon/actions/bookmark_list';
import {
  addStatusesToBookmarkFolder,
  bookmarkListKey,
  fetchBookmarkDetails,
  fetchBookmarkList,
  removeBookmarks,
  removeStatusesFromBookmarkFolder,
} from 'mastodon/actions/bookmark_list';
import { openModal } from 'mastodon/actions/modal';
import type {
  ApiBookmarkFolderJSON,
  BookmarkQuery,
} from 'mastodon/api_types/bookmark_folders';
import { getStatusList } from 'mastodon/selectors';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  added: {
    id: 'bookmarks.select.added',
    defaultMessage:
      'Added {count, plural, one {# post} other {# posts}} to {name}.',
  },
  removedFromFolder: {
    id: 'bookmarks.select.removed_from_folder',
    defaultMessage:
      'Removed {count, plural, one {# post} other {# posts}} from this folder.',
  },
  unbookmarked: {
    id: 'bookmarks.select.unbookmarked',
    defaultMessage:
      'Removed {count, plural, one {# bookmark} other {# bookmarks}}.',
  },
  partial: {
    id: 'bookmarks.select.partial',
    defaultMessage:
      'Only {count, plural, one {# post was} other {# posts were}} processed. Please try the rest again.',
  },
  confirmTitle: {
    id: 'bookmarks.select.confirm_unbookmark.title',
    defaultMessage:
      'Remove {count, plural, one {# bookmark} other {# bookmarks}}?',
  },
  confirmMessage: {
    id: 'bookmarks.select.confirm_unbookmark.message',
    defaultMessage:
      'They will also be removed from every folder, and their notes will be deleted.',
  },
  confirm: {
    id: 'bookmarks.select.confirm_unbookmark.confirm',
    defaultMessage: 'Remove bookmarks',
  },
});

export const useBookmarkFolders = () => {
  const dispatch = useAppDispatch();
  const folderState = useAppSelector((state) => state.bookmarkFolders);
  const [ownFetchDone, setOwnFetchDone] = useState(false);
  const { stale, isLoading } = folderState;

  useEffect(() => {
    void dispatch(fetchBookmarkFolders()).finally(() => {
      setOwnFetchDone(true);
    });
  }, [dispatch]);

  useEffect(() => {
    if (ownFetchDone && stale && !isLoading)
      void dispatch(fetchBookmarkFolders());
  }, [dispatch, ownFetchDone, stale, isLoading]);

  return {
    folders: folderState.items,
    failed: folderState.hasError,
    settled: ownFetchDone && !isLoading && !stale,
  };
};

const EMPTY_LIST = ImmutableList<string>();

export const useBookmarkList = (query: BookmarkQuery, canLoad: boolean) => {
  const dispatch = useAppDispatch();
  const key = bookmarkListKey(query);
  const exists = useAppSelector((state) => state.status_lists.has(key));
  const statusIds = useAppSelector((state) =>
    exists ? getStatusList(state, key) : EMPTY_LIST,
  );
  const isLoading = useAppSelector(
    (state) => state.status_lists.getIn([key, 'isLoading'], true) as boolean,
  );
  const next = useAppSelector(
    (state) => state.status_lists.getIn([key, 'next'], null) as string | null,
  );
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!canLoad) return;
    if (lastKey.current === key && exists) return;

    lastKey.current = key;
    void dispatch(fetchBookmarkList({ query }));
  }, [dispatch, key, exists, canLoad, query]);

  const loadMore = useCallback(() => {
    if (next && !isLoading)
      void dispatch(fetchBookmarkList({ query, url: next }));
  }, [dispatch, query, next, isLoading]);

  return { key, statusIds, isLoading, next, loadMore };
};

export const useBookmarkDetailsLoader = (statusIds: ImmutableList<string>) => {
  const dispatch = useAppDispatch();
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const missing = statusIds
      .filter((id) => !requested.current.has(id))
      .toArray();
    if (missing.length === 0) return;

    missing.forEach((id) => requested.current.add(id));
    void dispatch(
      fetchBookmarkDetails({ statusIds: missing, skipAlert: true }),
    ).then((result) => {
      if (!isFulfilled(result)) {
        missing.forEach((id) => requested.current.delete(id));
      }
      return result;
    });
  }, [dispatch, statusIds]);
};

export const selectionRange = (
  statusIds: ImmutableList<string>,
  anchorId: string | null,
  id: string,
): string[] => {
  const end = statusIds.indexOf(id);
  const start = anchorId === null ? -1 : statusIds.indexOf(anchorId);
  if (start < 0 || end < 0) return [id];

  return statusIds
    .slice(Math.min(start, end), Math.max(start, end) + 1)
    .toArray();
};

export const useSelection = (statusIds: ImmutableList<string>) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    setSelected((current) => {
      const kept = [...current].filter((id) => statusIds.includes(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [statusIds]);

  const toggle = useCallback(
    (id: string, checked: boolean, extend = false) => {
      const ids = extend ? selectionRange(statusIds, anchor.current, id) : [id];
      anchor.current = id;

      setSelected((current) => {
        const nextSet = new Set(current);
        ids.forEach((target) => {
          if (checked) nextSet.add(target);
          else nextSet.delete(target);
        });
        return nextSet;
      });
    },
    [statusIds],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(statusIds.toArray()));
  }, [statusIds]);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);

  return { selected, toggle, selectAll, clear };
};

export const useBulkActions = ({
  folderId,
  folderName,
  onDone,
}: {
  folderId?: string;
  folderName: (id: string) => string;
  onDone: () => void;
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const finish = useCallback(
    (
      result: unknown,
      success: MessageDescriptor,
      values: Record<string, string> = {},
    ) => {
      setBusy(false);
      if (!isFulfilled(result)) return;

      const { statusIds, partial } = result.payload as ChunkedResult;
      const count = statusIds.length;

      dispatch(
        showAlert({
          message: partial ? messages.partial : success,
          values: { count, ...values },
        }),
      );
      onDone();
    },
    [dispatch, onDone],
  );

  const addToFolder = useCallback(
    (targetId: string, statusIds: string[]) => {
      setBusy(true);
      void dispatch(
        addStatusesToBookmarkFolder({ folderId: targetId, statusIds }),
      ).then((result) => {
        finish(result, messages.added, { name: folderName(targetId) });
        return result;
      });
    },
    [dispatch, finish, folderName],
  );

  const removeFromFolder = useCallback(
    (statusIds: string[]) => {
      if (!folderId) return;
      setBusy(true);
      void dispatch(
        removeStatusesFromBookmarkFolder({ folderId, statusIds }),
      ).then((result) => {
        finish(result, messages.removedFromFolder);
        return result;
      });
    },
    [dispatch, finish, folderId],
  );

  const unbookmark = useCallback(
    (statusIds: string[]) => {
      const run = () => {
        setBusy(true);
        void dispatch(removeBookmarks({ statusIds })).then((result) => {
          finish(result, messages.unbookmarked);
          return result;
        });
      };

      dispatch(
        openModal({
          modalType: 'CONFIRM',
          modalProps: {
            title: intl.formatMessage(messages.confirmTitle, {
              count: statusIds.length,
            }),
            message: intl.formatMessage(messages.confirmMessage),
            confirm: intl.formatMessage(messages.confirm),
            dangerous: true,
            onConfirm: run,
          },
        }),
      );
    },
    [dispatch, finish, intl],
  );

  return { busy, addToFolder, removeFromFolder, unbookmark };
};

export const useSelectMode = ({
  statusIds,
  listKey,
  folderId,
  folders,
}: {
  statusIds: ImmutableList<string>;
  listKey: string;
  folderId?: string;
  folders: ApiBookmarkFolderJSON[];
}) => {
  const [selecting, setSelecting] = useState(false);
  const { selected, toggle, selectAll, clear } = useSelection(statusIds);

  const leave = useCallback(() => {
    setSelecting(false);
    clear();
  }, [clear]);

  const folderName = useCallback(
    (id: string) => folders.find((f) => f.id === id)?.name ?? '',
    [folders],
  );
  const { busy, addToFolder, removeFromFolder, unbookmark } = useBulkActions({
    folderId,
    folderName,
    onDone: leave,
  });

  useEffect(() => {
    clear();
  }, [listKey, clear]);

  const ids = useMemo(() => [...selected], [selected]);

  const changeSelecting = useCallback(
    (next: boolean) => {
      if (next) setSelecting(true);
      else leave();
    },
    [leave],
  );

  const addSelectedToFolder = useCallback(
    (targetId: string) => {
      addToFolder(targetId, ids);
    },
    [addToFolder, ids],
  );

  const removeSelectedFromFolder = useCallback(() => {
    removeFromFolder(ids);
  }, [removeFromFolder, ids]);

  const unbookmarkSelected = useCallback(() => {
    unbookmark(ids);
  }, [unbookmark, ids]);

  return {
    selecting,
    changeSelecting,
    leave,
    selected,
    toggle,
    selectAll,
    clear,
    busy,
    addSelectedToFolder,
    removeSelectedFromFolder,
    unbookmarkSelected,
  };
};
