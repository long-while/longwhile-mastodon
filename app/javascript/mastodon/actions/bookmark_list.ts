import {
  apiAddStatusesToBookmarkFolder,
  apiGetBookmarkDetails,
  apiGetBookmarks,
  apiRemoveBookmarks,
  apiRemoveStatusesFromBookmarkFolder,
  apiSetBookmarkNote,
} from 'mastodon/api/bookmark_folders';
import type { BookmarkQuery } from 'mastodon/api_types/bookmark_folders';
import { createDataLoadingThunk } from 'mastodon/store/typed_functions';

import { bookmarkFolderListKey } from './bookmark_folders';
import { importFetchedStatuses } from './importer';

export const BOOKMARK_BATCH_SIZE = 40;

export const BOOKMARK_NOTE_MAX_LENGTH = 500;

export const UNSORTED_FOLDER_ID = 'none';

export const isRealFolderId = (
  folderId: string | undefined,
): folderId is string => !!folderId && folderId !== UNSORTED_FOLDER_ID;

const filterSuffix = (query: BookmarkQuery) => {
  const parts: string[] = [];
  const q = query.q?.trim();

  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (query.onlyMedia) parts.push('media');
  if (query.accountId) parts.push(`account=${query.accountId}`);

  return parts.join('&');
};

export type BookmarkListKey = 'bookmarks' | `bookmarks:${string}`;

export const bookmarkListKey = (query: BookmarkQuery): BookmarkListKey => {
  const scope = query.folderId ?? 'all';
  const filters = filterSuffix(query);

  if (filters) return `bookmarks:${scope}|${filters}`;

  return scope === 'all' ? 'bookmarks' : bookmarkFolderListKey(scope);
};

export interface ParsedBookmarkListKey {
  scope: string;
  filtered: boolean;
}

export const parseBookmarkListKey = (
  key: unknown,
): ParsedBookmarkListKey | null => {
  if (key === 'bookmarks') return { scope: 'all', filtered: false };
  if (typeof key !== 'string' || !key.startsWith('bookmarks:')) return null;

  const rest = key.slice('bookmarks:'.length);
  const bar = rest.indexOf('|');

  if (bar === -1) return { scope: rest, filtered: false };

  return { scope: rest.slice(0, bar), filtered: true };
};

export const chunkIds = (ids: string[], size = BOOKMARK_BATCH_SIZE) => {
  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }

  return chunks;
};

export interface ChunkedResult {
  statusIds: string[];
  partial: boolean;
}

const runInChunks = async (
  ids: string[],
  send: (part: string[]) => Promise<{ status_ids: string[] }>,
): Promise<ChunkedResult> => {
  const done: string[] = [];

  for (const part of chunkIds(ids)) {
    try {
      const { status_ids } = await send(part);
      done.push(...status_ids);
    } catch (error) {
      if (done.length === 0) throw error;
      return { statusIds: done, partial: true };
    }
  }

  return { statusIds: done, partial: false };
};

export const fetchBookmarkList = createDataLoadingThunk(
  'bookmarks/fetch_list',
  ({ query, url }: { query: BookmarkQuery; url?: string }) =>
    apiGetBookmarks(query, url),
  ({ statuses, next }, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses(statuses));

    return {
      key: bookmarkListKey(actionArg.query),
      statusIds: statuses.map((status) => status.id),
      next: next ?? null,
      append: !!actionArg.url,
    };
  },
);

export const fetchBookmarkDetails = createDataLoadingThunk(
  'bookmarks/fetch_details',
  async ({ statusIds }: { statusIds: string[]; skipAlert?: boolean }) => {
    const details = [];

    for (const part of chunkIds(statusIds)) {
      details.push(...(await apiGetBookmarkDetails(part)));
    }

    return { requested: statusIds, details };
  },
  { useLoadingBar: false },
);

export const setBookmarkNote = createDataLoadingThunk(
  'bookmarks/set_note',
  ({
    statusId,
    note,
  }: {
    statusId: string;
    note: string;
    skipAlert?: boolean;
  }) => apiSetBookmarkNote(statusId, note),
);

export const addStatusesToBookmarkFolder = createDataLoadingThunk(
  'bookmark_folders/add_statuses',
  async ({
    folderId,
    statusIds,
  }: {
    folderId: string;
    statusIds: string[];
  }) => ({
    folderId,
    ...(await runInChunks(statusIds, (part) =>
      apiAddStatusesToBookmarkFolder(folderId, part),
    )),
  }),
);

export const removeStatusesFromBookmarkFolder = createDataLoadingThunk(
  'bookmark_folders/remove_statuses',
  async ({
    folderId,
    statusIds,
  }: {
    folderId: string;
    statusIds: string[];
  }) => ({
    folderId,
    ...(await runInChunks(statusIds, (part) =>
      apiRemoveStatusesFromBookmarkFolder(folderId, part),
    )),
  }),
);

export const removeBookmarks = createDataLoadingThunk(
  'bookmarks/remove_many',
  ({ statusIds }: { statusIds: string[] }) =>
    runInChunks(statusIds, (part) => apiRemoveBookmarks(part)),
);
