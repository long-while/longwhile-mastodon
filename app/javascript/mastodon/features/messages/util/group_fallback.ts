// @_longwhile custom feature

import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';

export const opensInChat = (room: Pick<ApiDmRoomJSON, 'is_group'>) =>
  !room.is_group;

export const fallbackPathFor = (room: ApiDmRoomJSON) =>
  opensInChat(room) ? `/messages/${room.id}` : '/conversations';
