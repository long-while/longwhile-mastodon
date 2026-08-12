// @_longwhile custom feature

import { createReducer } from '@reduxjs/toolkit';

import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import {
  discardDmMessage,
  fetchDmRoomStatuses,
  hideDmMessage,
  sendDmMessage,
} from '../actions/dm_rooms';
import { timelineDelete } from '../actions/timelines_typed';


export interface PendingDmMessage {
  localId: string;

  idempotencyKey: string;

  text: string;
  createdAt: string;
  inReplyToId?: string;

  mediaIds?: string[];

  recipientAccts: string[];
  recipientIds: string[];

  state: 'sending' | 'failed';

  rateLimited?: boolean;
}

export interface DmRoomMessages {
  statusIds: string[];
  pending: PendingDmMessage[];
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  loaded: boolean;
}

export type DmMessagesState = Record<string, DmRoomMessages>;

const initialState: DmMessagesState = {};

const emptyRoom = (): DmRoomMessages => ({
  statusIds: [],
  pending: [],
  hasMore: true,
  isLoading: false,
  hasError: false,
  loaded: false,
});

const merge = (existing: string[], incoming: string[]) =>
  Array.from(new Set([...existing, ...incoming])).sort(compareIds);

const isRateLimited = (error: unknown) =>
  (error as { response?: { status?: number } } | undefined)?.response?.status ===
  429;

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
    .addCase(sendDmMessage.pending, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      const existing = room.pending.find(
        (entry) => entry.localId === meta.arg.localId,
      );

      if (existing) {
        existing.state = 'sending';
        existing.rateLimited = false;
        return;
      }

      room.pending.push({
        localId: meta.arg.localId,
        idempotencyKey: meta.arg.idempotencyKey,
        text: meta.arg.text,
        createdAt: meta.arg.createdAt,
        inReplyToId: meta.arg.inReplyToId,
        mediaIds: meta.arg.mediaIds,
        recipientAccts: meta.arg.recipientAccts,
        recipientIds: meta.arg.recipientIds,
        state: 'sending',
      });
    })
    .addCase(sendDmMessage.fulfilled, (state, { payload, meta }) => {
      const room = (state[payload.roomId] ??= emptyRoom());

      room.statusIds = merge(room.statusIds, payload.statusIds);
      room.pending = room.pending.filter(
        (entry) => entry.localId !== meta.arg.localId,
      );
    })
    .addCase(sendDmMessage.rejected, (state, { meta, payload }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      const entry = room.pending.find(
        (item) => item.localId === meta.arg.localId,
      );

      if (!entry) return;

      entry.state = 'failed';
      entry.rateLimited = isRateLimited(payload?.error);
    })
    .addCase(discardDmMessage, (state, { payload }) => {
      const room = state[payload.roomId];

      if (!room) return;

      room.pending = room.pending.filter(
        (entry) => entry.localId !== payload.localId,
      );
    })
    .addCase(hideDmMessage.fulfilled, (state, { payload }) => {
      const room = state[payload.roomId];

      if (!room?.statusIds.includes(payload.statusId)) return;

      room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
    })
    .addCase(timelineDelete, (state, { payload }) => {
      Object.values(state).forEach((room) => {
        if (!room.statusIds.includes(payload.statusId)) return;

        room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
      });
    });
});
