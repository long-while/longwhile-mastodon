import { createReducer } from '@reduxjs/toolkit';

import {
  createBookmarkFolder,
  deleteBookmarkFolder,
  fetchBookmarkFolders,
  renameBookmarkFolder,
  reorderBookmarkFolders,
} from 'mastodon/actions/bookmark_folders';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';

export interface BookmarkFoldersState {
  items: ApiBookmarkFolderJSON[];
  loaded: boolean;
  isLoading: boolean;
  hasError: boolean;
}

const initialState: BookmarkFoldersState = {
  items: [],
  loaded: false,
  isLoading: false,
  hasError: false,
};

const byPosition = (a: ApiBookmarkFolderJSON, b: ApiBookmarkFolderJSON) =>
  a.position - b.position || a.id.localeCompare(b.id, 'en', { numeric: true });

export const bookmarkFoldersReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchBookmarkFolders.pending, (state) => {
      state.isLoading = true;
    })
    .addCase(fetchBookmarkFolders.rejected, (state) => {
      state.isLoading = false;
      state.hasError = true;
    })
    .addCase(fetchBookmarkFolders.fulfilled, (state, action) => {
      state.items = [...action.payload].sort(byPosition);
      state.loaded = true;
      state.isLoading = false;
      state.hasError = false;
    })
    .addCase(reorderBookmarkFolders.fulfilled, (state, action) => {
      state.items = [...action.payload].sort(byPosition);
    })
    .addCase(createBookmarkFolder.fulfilled, (state, action) => {
      state.items = [...state.items, action.payload].sort(byPosition);
    })
    .addCase(renameBookmarkFolder.fulfilled, (state, action) => {
      state.items = state.items.map((folder) =>
        folder.id === action.payload.id ? action.payload : folder,
      );
    })
    .addCase(deleteBookmarkFolder.fulfilled, (state, action) => {
      state.items = state.items.filter(
        (folder) => folder.id !== action.payload.id,
      );
    });
});
