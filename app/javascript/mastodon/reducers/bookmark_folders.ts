import type { UnknownAction } from '@reduxjs/toolkit';
import { createReducer, isAnyOf } from '@reduxjs/toolkit';

import {
  createBookmarkFolder,
  deleteBookmarkFolder,
  fetchBookmarkFolders,
  renameBookmarkFolder,
  reorderBookmarkFolders,
  setStatusBookmarkFolders,
} from 'mastodon/actions/bookmark_folders';
import {
  addStatusesToBookmarkFolder,
  removeBookmarks,
  removeStatusesFromBookmarkFolder,
} from 'mastodon/actions/bookmark_list';
import { UNBOOKMARK_SUCCESS } from 'mastodon/actions/interactions';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';

export interface BookmarkFoldersState {
  items: ApiBookmarkFolderJSON[];
  loaded: boolean;
  isLoading: boolean;
  hasError: boolean;
  stale: boolean;
  mutationSeq: number;
  pendingFetches: Record<string, number>;
}

const initialState: BookmarkFoldersState = {
  items: [],
  loaded: false,
  isLoading: false,
  hasError: false,
  stale: false,
  mutationSeq: 0,
  pendingFetches: {},
};

const byPosition = (a: ApiBookmarkFolderJSON, b: ApiBookmarkFolderJSON) =>
  a.position - b.position || a.id.localeCompare(b.id, 'en', { numeric: true });

const markMutated = (state: BookmarkFoldersState) => {
  state.mutationSeq += 1;
};

const markCountsChanged = (state: BookmarkFoldersState) => {
  state.mutationSeq += 1;
  state.stale = true;
};

const finishFetch = (state: BookmarkFoldersState, requestId: string) => {
  const startedAt = state.pendingFetches[requestId];
  Reflect.deleteProperty(state.pendingFetches, requestId);
  state.isLoading = Object.keys(state.pendingFetches).length > 0;

  return startedAt === undefined || startedAt === state.mutationSeq;
};

const isUnbookmarkSuccess = (action: UnknownAction) =>
  action.type === UNBOOKMARK_SUCCESS;

export const bookmarkFoldersReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchBookmarkFolders.pending, (state, action) => {
      state.pendingFetches[action.meta.requestId] = state.mutationSeq;
      state.isLoading = true;
    })
    .addCase(fetchBookmarkFolders.rejected, (state, action) => {
      finishFetch(state, action.meta.requestId);
      state.hasError = true;
    })
    .addCase(fetchBookmarkFolders.fulfilled, (state, action) => {
      if (!finishFetch(state, action.meta.requestId)) {
        state.stale = true;
        return;
      }

      state.items = [...action.payload].sort(byPosition);
      state.loaded = true;
      state.hasError = false;
      state.stale = false;
    })
    .addCase(reorderBookmarkFolders.fulfilled, (state, action) => {
      markMutated(state);
      state.items = [...action.payload].sort(byPosition);
    })
    .addCase(createBookmarkFolder.fulfilled, (state, action) => {
      markMutated(state);
      state.items = [
        ...state.items.filter((folder) => folder.id !== action.payload.id),
        action.payload,
      ].sort(byPosition);
    })
    .addCase(renameBookmarkFolder.fulfilled, (state, action) => {
      markMutated(state);
      state.items = state.items.map((folder) =>
        folder.id === action.payload.id ? action.payload : folder,
      );
    })
    .addCase(deleteBookmarkFolder.fulfilled, (state, action) => {
      markMutated(state);
      state.items = state.items.filter(
        (folder) => folder.id !== action.payload.id,
      );
    })
    .addMatcher(
      isAnyOf(
        setStatusBookmarkFolders.fulfilled,
        addStatusesToBookmarkFolder.fulfilled,
        addStatusesToBookmarkFolder.rejected,
        removeStatusesFromBookmarkFolder.fulfilled,
        removeStatusesFromBookmarkFolder.rejected,
        removeBookmarks.fulfilled,
        removeBookmarks.rejected,
      ),
      markCountsChanged,
    )
    .addMatcher(isUnbookmarkSuccess, markCountsChanged);
});
