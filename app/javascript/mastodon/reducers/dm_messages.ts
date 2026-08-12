// @_longwhile custom feature

import { createReducer } from '@reduxjs/toolkit';

import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import { fetchDmRoomStatuses, sendDmMessage } from '../actions/dm_rooms';
import { timelineDelete } from '../actions/timelines_typed';


export interface DmRoomMessages {
  statusIds: string[];
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  loaded: boolean;
}

export type DmMessagesState = Record<string, DmRoomMessages>;

const initialState: DmMessagesState = {};

const emptyRoom = (): DmRoomMessages => ({
  statusIds: [],
  hasMore: true,
  isLoading: false,
  hasError: false,
  loaded: false,
});

const merge = (existing: string[], incoming: string[]) =>
  Array.from(new Set([...existing, ...incoming])).sort(compareIds);

export const dmMessagesReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchDmRoomStatuses.pending, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = true;
      room.hasError = false;
    })
    .addCase(fetchDmRoomStatuses.rejected, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = false;
      room.hasError = true;
    })
    .addCase(fetchDmRoomStatuses.fulfilled, (state, { payload }) => {
      const room = (state[payload.roomId] ??= emptyRoom());

      room.isLoading = false;
      room.hasError = false;
      room.loaded = true;
      room.statusIds = merge(room.statusIds, payload.statusIds);

      if (payload.mode !== 'append') {
        room.hasMore = payload.hasMore;
      }
    })
    .addCase(sendDmMessage.fulfilled, (state, { payload }) => {
      const room = (state[payload.roomId] ??= emptyRoom());
      room.statusIds = merge(room.statusIds, payload.statusIds);
    })
    .addCase(timelineDelete, (state, { payload }) => {
      Object.values(state).forEach((room) => {
        if (!room.statusIds.includes(payload.statusId)) return;

        room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
      });
    });
});
