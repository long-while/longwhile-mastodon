// @_longwhile custom feature

import api, {
  apiRequestGet,
  apiRequestPost,
  apiRequestDelete,
  getLinks,
} from 'mastodon/api';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

export const apiGetDmRooms = async (url?: string) => {
  const response = await api().request<ApiDmRoomJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/dm_rooms',
  });

  return {
    rooms: response.data,
    links: getLinks(response),
  };
};

export const apiGetDmRoom = (roomId: string) =>
  apiRequestGet<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}`);

export const apiCreateDmRoom = (accountIds: string[]) =>
  apiRequestPost<ApiDmRoomJSON>('v1/dm_rooms', { account_ids: accountIds });

export const apiLeaveDmRoom = (roomId: string) =>
  apiRequestDelete(`v1/dm_rooms/${roomId}`);

export const apiMarkDmRoomRead = (roomId: string, statusId?: string) =>
  apiRequestPost<ApiDmRoomJSON>(
    `v1/dm_rooms/${roomId}/read`,
    statusId ? { status_id: statusId } : {},
  );

export const apiSendDmMessage = (params: {
  text: string;
  inReplyToId?: string;
  recipientAccts: string[];
  recipientIds: string[];
  mediaIds?: string[];
}) => {
  const mentions = params.recipientAccts.map((acct) => `@${acct}`).join(' ');

  return apiRequestPost<ApiStatusJSON>('v1/statuses', {
    status: [mentions, params.text].filter(Boolean).join(' '),
    visibility: 'direct',
    in_reply_to_id: params.inReplyToId,
    allowed_mentions: params.recipientIds,
    media_ids: params.mediaIds?.length ? params.mediaIds : undefined,
  });
};

export const apiGetDmRoomStatuses = async (
  roomId: string,
  options: { maxId?: string; sinceId?: string } = {},
) => {
  const response = await api().request<ApiStatusJSON[]>({
    method: 'GET',
    url: `/api/v1/dm_rooms/${roomId}/statuses`,
    params: {
      max_id: options.maxId,
      since_id: options.sinceId,
    },
  });

  return {
    statuses: response.data,
    links: getLinks(response),
  };
};
