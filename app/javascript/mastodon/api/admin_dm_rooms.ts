// @_longwhile custom feature

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
