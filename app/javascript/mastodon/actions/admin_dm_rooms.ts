// @_longwhile custom feature

import {
  apiGetAdminDmRoom,
  apiGetAdminDmRooms,
  apiGetAdminDmRoomStatuses,
} from 'mastodon/api/admin_dm_rooms';
import { createDataLoadingThunk } from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';

const nextLinkOf = (links: { refs: { rel: string; uri: string }[] }) =>
  links.refs.find((link) => link.rel === 'next')?.uri;

export const fetchAdminDmRooms = createDataLoadingThunk(
  'admin_dm_rooms/fetch',
  async ({ url }: { url?: string } = {}) => {
    const { rooms, links } = await apiGetAdminDmRooms(url);

    return { rooms, next: nextLinkOf(links) };
  },
  ({ rooms, next }, { dispatch }) => {
    dispatch(importFetchedAccounts(rooms.flatMap((room) => room.accounts)));

    return { rooms, next };
  },
);

export const fetchAdminDmRoom = createDataLoadingThunk(
  'admin_dm_rooms/fetch_one',
  ({ roomId }: { roomId: string }) => apiGetAdminDmRoom(roomId),
  (room, { dispatch }) => {
    dispatch(importFetchedAccounts(room.accounts));

    return room;
  },
);

export const fetchAdminDmRoomStatuses = createDataLoadingThunk(
  'admin_dm_messages/fetch',
  ({ roomId, maxId }: { roomId: string; maxId?: string }) =>
    apiGetAdminDmRoomStatuses(roomId, { maxId }),
  ({ statuses, links }, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses(statuses));

    return {
      roomId: actionArg.roomId,
      statusIds: statuses.map((status) => status.id),
      hasMore: Boolean(nextLinkOf(links)),
      append: Boolean(actionArg.maxId),
    };
  },
  { useLoadingBar: false },
);
