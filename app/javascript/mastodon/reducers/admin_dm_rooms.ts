// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
//   운영진 화면(/messages/all)의 방 목록과 방별 메시지 id.
//
//   일반 채팅의 dmRooms / dmMessages 와 **따로 든다.** 같은 저장소를 쓰면 운영진
//   화면을 한 번 열었을 때 남의 방이 자기 대화 목록에 섞여 들어간다.

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

// 화면은 위에서 아래로 시간순인데 API 는 역순으로 준다. 저장 시점에 정규화한다.
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
    // 운영진 화면에서 글을 지우는 수단은 없지만, 다른 화면에서 지운 글이 여기
    // 열려 있을 수 있다. 죽은 id 를 남기지 않는다.
    .addCase(timelineDelete, (state, { payload }) => {
      Object.values(state.messages).forEach((room) => {
        if (!room.statusIds.includes(payload.statusId)) return;

        room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
      });
    });
});
