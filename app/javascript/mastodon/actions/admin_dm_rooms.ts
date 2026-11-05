// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리

import {
  apiGetAdminDmRoom,
  apiGetAdminDmRooms,
  apiGetAdminDmRoomStatuses,
} from 'mastodon/api/admin_dm_rooms';
import { createDataLoadingThunk } from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';

const nextLinkOf = (links: { refs: { rel: string; uri: string }[] }) =>
  links.refs.find((link) => link.rel === 'next')?.uri;

// 계정은 공용 accounts 스토어에 넣어야 아바타·표시 이름이 그려진다.
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

// 메시지는 기존 statuses 리듀서에 넣고 우리는 id 배열만 든다. 일반 채팅과 같은
// 방식이라 MessageBubble 을 그대로 쓸 수 있다.
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
      // 과거를 더 받는 호출인지(위로 스크롤) 첫 로딩인지.
      append: Boolean(actionArg.maxId),
    };
  },
  { useLoadingBar: false },
);
