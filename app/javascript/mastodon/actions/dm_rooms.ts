// @_longwhile custom feature

import {
  apiCreateDmRoom,
  apiSendDmMessage,
  apiGetDmRoom,
  apiGetDmRooms,
  apiGetDmRoomStatuses,
  apiLeaveDmRoom,
  apiMarkDmRoomRead,
} from 'mastodon/api/dm_rooms';
import { createDataLoadingThunk } from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';

const nextLinkOf = (links: { refs: { rel: string; uri: string }[] }) =>
  links.refs.find((link) => link.rel === 'next')?.uri;

export const fetchDmRooms = createDataLoadingThunk(
  'dm_rooms/fetch',
  async ({ url }: { url?: string } = {}) => {
    const { rooms, links } = await apiGetDmRooms(url);

    return { rooms, next: nextLinkOf(links) };
  },
  ({ rooms, next }, { dispatch }) => {
    dispatch(importFetchedAccounts(rooms.flatMap((room) => room.accounts)));

    return { rooms, next };
  },
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
  }: {
    roomId: string;
    text: string;
    inReplyToId?: string;
    recipientAccts: string[];
    recipientIds: string[];
    mediaIds?: string[];
  }) =>
    apiSendDmMessage({
      text,
      inReplyToId,
      recipientAccts,
      recipientIds,
      mediaIds,
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
