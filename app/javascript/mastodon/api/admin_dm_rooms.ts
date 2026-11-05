// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
//   운영진 전용. 응답 형태는 일반 DM API 와 같지만(ApiDmRoomJSON) 뜻이 다른
//   필드가 있다 — `accounts` 가 참여자 **전원**이고, unread_count 는 항상 0 이다.
//   REST::Admin::DmRoomSerializer 의 주석 참조.

import api, { apiRequestGet, getLinks } from 'mastodon/api';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

export const apiGetAdminDmRooms = async (url?: string) => {
  const response = await api().request<ApiDmRoomJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/admin/dm_rooms',
  });

  return { rooms: response.data, links: getLinks(response) };
};

export const apiGetAdminDmRoom = (roomId: string) =>
  apiRequestGet<ApiDmRoomJSON>(`v1/admin/dm_rooms/${roomId}`);

export const apiGetAdminDmRoomStatuses = async (
  roomId: string,
  options: { maxId?: string } = {},
) => {
  const response = await api().request<ApiStatusJSON[]>({
    method: 'GET',
    url: `/api/v1/admin/dm_rooms/${roomId}/statuses`,
    params: { max_id: options.maxId },
  });

  return { statuses: response.data, links: getLinks(response) };
};
