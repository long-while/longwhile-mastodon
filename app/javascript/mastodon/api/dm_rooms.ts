// @_longwhile custom feature

import api, {
  apiRequest,
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

export const apiSetDmRoomTitle = (roomId: string, title: string) =>
  apiRequest<ApiDmRoomJSON>('PATCH', `v1/dm_rooms/${roomId}/title`, {
    data: { title },
  });

export const apiMarkDmRoomRead = (roomId: string, statusId?: string) =>
  apiRequestPost<ApiDmRoomJSON>(
    `v1/dm_rooms/${roomId}/read`,
    statusId ? { status_id: statusId } : {},
  );

export const apiSendDmMessage = async (params: {
  text: string;
  inReplyToId?: string;
  recipientAccts: string[];
  recipientIds: string[];
  mediaIds?: string[];
  idempotencyKey?: string;
}) => {
  const mentions = params.recipientAccts.map((acct) => `@${acct}`).join(' ');

  const response = await api().request<ApiStatusJSON>({
    method: 'POST',
    url: '/api/v1/statuses',
    headers: params.idempotencyKey
      ? { 'Idempotency-Key': params.idempotencyKey }
      : undefined,
    data: {
      status: [mentions, params.text].filter(Boolean).join(' '),
      visibility: 'direct',
      in_reply_to_id: params.inReplyToId,
      allowed_mentions: params.recipientIds,
      media_ids: params.mediaIds?.length ? params.mediaIds : undefined,
    },
  });

  return response.data;
};

export const apiAddDmRoomMembers = (roomId: string, accountIds: string[]) =>
  apiRequestPost<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}/members`, {
    account_ids: accountIds,
  });

export const apiRemoveDmRoomMember = (roomId: string, accountId: string) =>
  apiRequestDelete<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}/members/${accountId}`);

export const apiSetDmRoomNickname = (
  roomId: string,
  accountId: string,
  nickname: string,
) =>
  apiRequest<ApiDmRoomJSON>(
    'PUT',
    `v1/dm_rooms/${roomId}/members/${accountId}/nickname`,
    { data: { nickname } },
  );

export const apiHideDmMessage = (roomId: string, statusId: string) =>
  apiRequestPost(`v1/dm_rooms/${roomId}/statuses/${statusId}/hide`);

export const apiGetDmMessageSource = (statusId: string) =>
  apiRequestGet<{ id: string; text: string; spoiler_text: string }>(
    `v1/statuses/${statusId}/source`,
  );

export const apiEditDmMessage = async (params: {
  statusId: string;
  text: string;
  recipientAccts: string[];
  mediaIds?: string[];
}) => {
  const mentions = params.recipientAccts.map((acct) => `@${acct}`).join(' ');

  return apiRequest<ApiStatusJSON>('PUT', `v1/statuses/${params.statusId}`, {
    data: {
      status: [mentions, params.text].filter(Boolean).join(' '),
      media_ids: params.mediaIds?.length ? params.mediaIds : undefined,
    },
  });
};

export const apiDeleteDmMessageForRedraft = async (statusId: string) => {
  const response = await api().request<ApiStatusJSON & { text?: string }>({
    method: 'DELETE',
    url: `/api/v1/statuses/${statusId}`,
    params: { delete_media: false },
  });

  return response.data;
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
