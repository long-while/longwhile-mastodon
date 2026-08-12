// @_longwhile custom feature

import { createReducer } from '@reduxjs/toolkit';

import type {
  ApiDmReadStateJSON,
  ApiDmRoomJSON,
} from 'mastodon/api_types/dm_rooms';
import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import {
  createDmRoom,
  fetchDmRoom,
  fetchDmRooms,
  leaveDmRoom,
  markDmRoomRead,
  setActiveDmRoom,
  setDmRoomTitle,
  setDmStreamConnected,
  updateDmReadState,
} from '../actions/dm_rooms';

export interface DmRoomsState {
  rooms: Record<string, ApiDmRoomJSON>;
  order: string[];
  next?: string;
  isLoading: boolean;
  loaded: boolean;

  activeRoomId?: string;

  streamConnected: boolean;

  hasError: boolean;
}

const initialState: DmRoomsState = {
  rooms: {},
  order: [],
  next: undefined,
  isLoading: false,
  loaded: false,
  hasError: false,
  activeRoomId: undefined,

  streamConnected: true,
};

const mergeReadStates = (
  before: ApiDmReadStateJSON[] | undefined,
  next: ApiDmReadStateJSON[] | undefined,
): ApiDmReadStateJSON[] | undefined => {
  if (!next) return before;
  if (!before || before.length === 0) return next;

  return next.map((state) => {
    const previous = before.find(
      (candidate) => candidate.account_id === state.account_id,
    );

    if (!previous) return state;

    if (
      compareIds(previous.last_read_status_id, state.last_read_status_id) <= 0
    ) {
      return state;
    }

    return {
      account_id: previous.account_id,
      last_read_status_id: previous.last_read_status_id,
    };
  });
};

const store = (state: DmRoomsState, room: ApiDmRoomJSON) => {
  state.rooms[room.id] = {
    ...room,
    participant_read_states: mergeReadStates(
      state.rooms[room.id]?.participant_read_states,
      room.participant_read_states,
    ),
  };
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

      const ids = payload.rooms.map((room) => room.id);

      payload.rooms.forEach((room) => {
        store(state, room);
      });

      if (meta.arg.refresh) {
        state.order = [...ids, ...state.order.filter((id) => !ids.includes(id))];

        state.next ??= payload.next;

        return;
      }

      state.next = payload.next;

      state.order = meta.arg.url
        ? [...state.order.filter((id) => !ids.includes(id)), ...ids]
        : ids;
    })
    .addCase(setActiveDmRoom, (state, { payload }) => {
      state.activeRoomId = payload.roomId;
    })
    .addCase(setDmStreamConnected, (state, { payload }) => {
      state.streamConnected = payload.connected;
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
      store(state, payload);
    })
    .addCase(setDmRoomTitle.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    .addCase(updateDmReadState, (state, { payload }) => {
      const room = state.rooms[payload.roomId];

      if (!room) return;

      const before = room.participant_read_states ?? [];
      const others = before.filter(
        (candidate) => candidate.account_id !== payload.accountId,
      );
      const previous = before.find(
        (candidate) => candidate.account_id === payload.accountId,
      );

      if (
        previous &&
        compareIds(previous.last_read_status_id, payload.lastReadStatusId) >= 0
      ) {
        return;
      }

      room.participant_read_states = [
        ...others,
        {
          account_id: payload.accountId,
          last_read_status_id: payload.lastReadStatusId,
        },
      ];
    })
    .addCase(leaveDmRoom.fulfilled, (state, { payload }) => {
      state.order = state.order.filter((id) => id !== payload.roomId);
      state.rooms = Object.fromEntries(
        Object.entries(state.rooms).filter(([id]) => id !== payload.roomId),
      );
    });
});
