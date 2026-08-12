// @_longwhile custom feature

import { createAction } from '@reduxjs/toolkit';

import {
  apiCreateDmRoom,
  apiSendDmMessage,
  apiGetDmRoom,
  apiGetDmRooms,
  apiGetDmRoomStatuses,
  apiLeaveDmRoom,
  apiMarkDmRoomRead,
  apiSetDmRoomTitle,
} from 'mastodon/api/dm_rooms';
import {
  selectDmRoomMessages,
  selectDmRooms,
} from 'mastodon/features/messages/selectors';
import {
  createDataLoadingThunk,
  createThunk,
} from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';

const nextLinkOf = (links: { refs: { rel: string; uri: string }[] }) =>
  links.refs.find((link) => link.rel === 'next')?.uri;

export const setActiveDmRoom = createAction<{ roomId?: string }>(
  'dm_rooms/set_active',
);

export const setDmStreamConnected = createAction<{ connected: boolean }>(
  'dm_rooms/set_stream_connected',
);

export const updateDmReadState = createAction<{
  roomId: string;
  accountId: string;
  lastReadStatusId: string;
}>('dm_rooms/update_read_state');

export const discardDmMessage = createAction<{
  roomId: string;
  localId: string;
}>('dm_messages/discard');

export const fetchDmRooms = createDataLoadingThunk(
  'dm_rooms/fetch',
  async ({ url }: { url?: string; refresh?: boolean } = {}) => {
    const { rooms, links } = await apiGetDmRooms(url);

    return { rooms, next: nextLinkOf(links) };
  },
  ({ rooms, next }, { dispatch }) => {
    dispatch(importFetchedAccounts(rooms.flatMap((room) => room.accounts)));

    return { rooms, next };
  },
  { useLoadingBar: false },
);

export const fetchDmRoom = createDataLoadingThunk(
  'dm_rooms/fetch_one',
  ({ roomId }: { roomId: string }) => apiGetDmRoom(roomId),
  (room, { dispatch }) => {
    dispatch(importFetchedAccounts(room.accounts));

    return room;
  },
);

export const createDmRoom = createDataLoadingThunk(
  'dm_rooms/create',
  ({ accountIds }: { accountIds: string[] }) => apiCreateDmRoom(accountIds),
  (room, { dispatch }) => {
    dispatch(importFetchedAccounts(room.accounts));

    return room;
  },
);

export const leaveDmRoom = createDataLoadingThunk(
  'dm_rooms/leave',
  async ({ roomId }: { roomId: string }) => {
    await apiLeaveDmRoom(roomId);

    return { roomId };
  },
);

export const setDmRoomTitle = createDataLoadingThunk(
  'dm_rooms/set_title',
  ({ roomId, title }: { roomId: string; title: string }) =>
    apiSetDmRoomTitle(roomId, title),
);

export const markDmRoomRead = createDataLoadingThunk(
  'dm_rooms/read',
  ({ roomId, statusId }: { roomId: string; statusId?: string }) =>
    apiMarkDmRoomRead(roomId, statusId),
  { useLoadingBar: false },
);

export const sendDmMessage = createDataLoadingThunk(
  'dm_messages/send',
  ({
    text,
    inReplyToId,
    recipientAccts,
    recipientIds,
    mediaIds,
    idempotencyKey,
  }: {
    roomId: string;
    text: string;
    inReplyToId?: string;
    recipientAccts: string[];
    recipientIds: string[];
    mediaIds?: string[];

    localId: string;
    idempotencyKey: string;
    createdAt: string;
  }) =>
    apiSendDmMessage({
      text,
      inReplyToId,
      recipientAccts,
      recipientIds,
      mediaIds,
      idempotencyKey,
    }),
  (status, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses([status]));

    return { roomId: actionArg.roomId, statusIds: [status.id] };
  },
);

export const fetchDmRoomStatuses = createDataLoadingThunk(
  'dm_messages/fetch',
  ({
    roomId,
    maxId,
    sinceId,
  }: {
    roomId: string;
    maxId?: string;
    sinceId?: string;
  }) => apiGetDmRoomStatuses(roomId, { maxId, sinceId }),
  ({ statuses, links }, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses(statuses));

    return {
      roomId: actionArg.roomId,
      statusIds: statuses.map((status) => status.id),

      hasMore: Boolean(nextLinkOf(links)),

      mode: actionArg.sinceId ? ('append' as const) : actionArg.maxId ? ('prepend' as const) : ('replace' as const),
    };
  },
  { useLoadingBar: false },
);

const STREAM_REFRESH_DELAY = 400;

let streamRefreshTimer: ReturnType<typeof setTimeout> | undefined;

export const dmChatStreamUpdate = createThunk(
  'dm_rooms/stream_update',
  (_arg, { dispatch, getState }) => {
    if (streamRefreshTimer) clearTimeout(streamRefreshTimer);

    streamRefreshTimer = setTimeout(() => {
      streamRefreshTimer = undefined;

      void dispatch(fetchDmRooms({ refresh: true }));

      const state: unknown = getState();
      const roomId = selectDmRooms(state).activeRoomId;

      if (!roomId) return;

      const ids = selectDmRoomMessages(state, roomId)?.statusIds ?? [];

      void dispatch(
        fetchDmRoomStatuses({ roomId, sinceId: ids[ids.length - 1] }),
      );
    }, STREAM_REFRESH_DELAY);
  },
);
