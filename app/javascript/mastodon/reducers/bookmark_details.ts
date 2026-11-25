import type { UnknownAction } from '@reduxjs/toolkit';
import { createReducer } from '@reduxjs/toolkit';

import {
  deleteBookmarkFolder,
  setStatusBookmarkFolders,
} from 'mastodon/actions/bookmark_folders';
import {
  addStatusesToBookmarkFolder,
  fetchBookmarkDetails,
  removeBookmarks,
  removeStatusesFromBookmarkFolder,
  setBookmarkNote,
} from 'mastodon/actions/bookmark_list';
import { UNBOOKMARK_SUCCESS } from 'mastodon/actions/interactions';
import type { ApiBookmarkDetailJSON } from 'mastodon/api_types/bookmark_folders';

export interface BookmarkDetail {
  note: string;
  folderIds: string[];
}

export type BookmarkDetailsState = Record<string, BookmarkDetail | undefined>;

const initialState: BookmarkDetailsState = {};

const toDetail = (json: ApiBookmarkDetailJSON): BookmarkDetail => ({
  note: json.note,
  folderIds: json.folder_ids,
});

interface UnbookmarkAction {
  type: string;
  status: { get: (key: 'id') => string };
}

const isUnbookmarkSuccess = (
  action: UnknownAction,
): action is UnknownAction & UnbookmarkAction =>
  action.type === UNBOOKMARK_SUCCESS;

const forget = (state: BookmarkDetailsState, statusIds: string[]) => {
  statusIds.forEach((id) => {
    Reflect.deleteProperty(state, id);
  });
};

export const bookmarkDetailsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchBookmarkDetails.fulfilled, (state, action) => {
      forget(state, action.payload.requested);
      action.payload.details.forEach((json) => {
        state[json.status_id] = toDetail(json);
      });
    })
    .addCase(setBookmarkNote.fulfilled, (state, action) => {
      state[action.payload.status_id] = toDetail(action.payload);
    })
    .addCase(setStatusBookmarkFolders.fulfilled, (state, action) => {
      const detail = state[action.payload.statusId];
      if (detail) detail.folderIds = action.payload.folderIds;
    })
    .addCase(addStatusesToBookmarkFolder.fulfilled, (state, action) => {
      const { folderId, statusIds } = action.payload;

      statusIds.forEach((id) => {
        const detail = state[id];
        if (detail && !detail.folderIds.includes(folderId)) {
          detail.folderIds.push(folderId);
        }
      });
    })
    .addCase(removeStatusesFromBookmarkFolder.fulfilled, (state, action) => {
      const { folderId, statusIds } = action.payload;

      statusIds.forEach((id) => {
        const detail = state[id];
        if (detail) {
          detail.folderIds = detail.folderIds.filter((f) => f !== folderId);
        }
      });
    })
    .addCase(deleteBookmarkFolder.fulfilled, (state, action) => {
      Object.values(state).forEach((detail) => {
        if (detail) {
          detail.folderIds = detail.folderIds.filter(
            (f) => f !== action.payload.id,
          );
        }
      });
    })
    .addCase(removeBookmarks.fulfilled, (state, action) => {
      forget(state, action.payload.statusIds);
    })
    .addMatcher(isUnbookmarkSuccess, (state, action) => {
      forget(state, [action.status.get('id')]);
    });
});
