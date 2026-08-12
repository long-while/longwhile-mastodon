// @_longwhile custom feature

import { createReducer } from '@reduxjs/toolkit';

import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';

import {
  createDmRoom,
  fetchDmRoom,
  fetchDmRooms,
  leaveDmRoom,
  markDmRoomRead,
} from '../actions/dm_rooms';

export interface DmRoomsState {
  rooms: Record<string, ApiDmRoomJSON>;
  order: string[];
  next?: string;
  isLoading: boolean;
  loaded: boolean;

  hasError: boolean;
}

const initialState: DmRoomsState = {
  rooms: {},
  order: [],
  next: undefined,
  isLoading: false,
  loaded: false,
  hasError: false,
};

const store = (state: DmRoomsState, room: ApiDmRoomJSON) => {
  state.rooms[room.id] = room;
};

export const dmRoomsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchDmRooms.pending, (state) => {
      state.isLoading = true;
      state.hasError = false;
    })
    .addCase(fetchDmRooms.rejected, (state) => {
      state.isLoading = false;
      state.hasError = true;
    })
    .addCase(fetchDmRooms.fulfilled, (state, { payload, meta }) => {
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
    .addCase(fetchDmRoom.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    .addCase(createDmRoom.fulfilled, (state, { payload }) => {
      store(state, payload);

      if (!state.order.includes(payload.id)) {
        state.order.unshift(payload.id);
      }
    })
    .addCase(markDmRoomRead.fulfilled, (state, { payload }) => {
      state.rooms[payload.id] = payload;
    })
    .addCase(leaveDmRoom.fulfilled, (state, { payload }) => {
      state.order = state.order.filter((id) => id !== payload.roomId);
      state.rooms = Object.fromEntries(
        Object.entries(state.rooms).filter(([id]) => id !== payload.roomId),
      );
    });
});
