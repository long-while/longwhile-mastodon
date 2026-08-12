// @_longwhile custom feature

import { createReducer } from '@reduxjs/toolkit';

import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import {
  fetchAdminDmRoom,
  fetchAdminDmRooms,
  fetchAdminDmRoomStatuses,
} from '../actions/admin_dm_rooms';
import { timelineDelete } from '../actions/timelines_typed';
import type { ApiDmRoomJSON } from '../api_types/dm_rooms';

interface AdminRoomMessages {
  statusIds: string[];
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  loaded: boolean;
}

export interface AdminDmRoomsState {
  rooms: Record<string, ApiDmRoomJSON>;
  order: string[];
  next?: string;
  isLoading: boolean;
  loaded: boolean;
  hasError: boolean;
  messages: Record<string, AdminRoomMessages>;
}

const initialState: AdminDmRoomsState = {
  rooms: {},
  order: [],
  next: undefined,
  isLoading: false,
  loaded: false,
  hasError: false,
  messages: {},
};

const emptyRoom = (): AdminRoomMessages => ({
  statusIds: [],
  hasMore: true,
  isLoading: false,
  hasError: false,
  loaded: false,
});

const merge = (existing: string[], incoming: string[]) =>
  Array.from(new Set([...existing, ...incoming])).sort(compareIds);

export const adminDmRoomsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchAdminDmRooms.pending, (state) => {
      state.isLoading = true;
      state.hasError = false;
    })
    .addCase(fetchAdminDmRooms.rejected, (state) => {
      state.isLoading = false;
      state.hasError = true;
    })
    .addCase(fetchAdminDmRooms.fulfilled, (state, { payload, meta }) => {
      state.isLoading = false;
      state.loaded = true;
      state.hasError = false;
      state.next = payload.next;

      const ids = payload.rooms.map((room) => room.id);

      payload.rooms.forEach((room) => {
        state.rooms[room.id] = room;
      });

      state.order = meta.arg?.url
        ? [...state.order.filter((id) => !ids.includes(id)), ...ids]
        : ids;
    })
    .addCase(fetchAdminDmRoom.fulfilled, (state, { payload }) => {
      state.rooms[payload.id] = payload;
    })
    .addCase(fetchAdminDmRoomStatuses.pending, (state, { meta }) => {
      const room = (state.messages[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = true;
      room.hasError = false;
    })
    .addCase(fetchAdminDmRoomStatuses.rejected, (state, { meta }) => {
      const room = (state.messages[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = false;
      room.hasError = true;
    })
    .addCase(fetchAdminDmRoomStatuses.fulfilled, (state, { payload }) => {
      const room = (state.messages[payload.roomId] ??= emptyRoom());

      room.isLoading = false;
      room.hasError = false;
      room.loaded = true;
      room.hasMore = payload.hasMore;
      room.statusIds = merge(room.statusIds, payload.statusIds);
    })
    .addCase(timelineDelete, (state, { payload }) => {
      Object.values(state.messages).forEach((room) => {
        if (!room.statusIds.includes(payload.statusId)) return;

        room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
      });
    });
});
