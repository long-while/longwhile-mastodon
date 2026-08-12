// @_longwhile custom feature

import type { Map as ImmutableMap } from 'immutable';

import type { Account } from 'mastodon/models/account';
import type { Status } from 'mastodon/models/status';
import type {
  DmMessagesState,
  DmRoomMessages,
} from 'mastodon/reducers/dm_messages';
import type { DmRoomsState } from 'mastodon/reducers/dm_rooms';

interface DmChatState {
  dmRooms: DmRoomsState;
  dmMessages: DmMessagesState;
  accounts: ImmutableMap<string, Account>;
  statuses: ImmutableMap<string, Status>;
}

const asDmChatState = (state: unknown) => state as DmChatState;

export const selectDmRooms = (state: unknown): DmRoomsState =>
  asDmChatState(state).dmRooms;

export const selectDmRoom = (state: unknown, roomId: string | undefined) =>
  roomId ? selectDmRooms(state).rooms[roomId] : undefined;

export const selectDmRoomMessages = (
  state: unknown,
  roomId: string | undefined,
): DmRoomMessages | undefined =>
  roomId ? asDmChatState(state).dmMessages[roomId] : undefined;

export const selectMessageAccount = (
  state: unknown,
  accountId: string | undefined,
): Account | undefined =>
  accountId ? asDmChatState(state).accounts.get(accountId) : undefined;

export const selectMessageStatuses = (
  state: unknown,
): ImmutableMap<string, Status> => asDmChatState(state).statuses;

const DEFAULT_MAX_MEDIA_ATTACHMENTS = 4;

export const selectMaxMediaAttachments = (state: unknown): number => {
  const server = (state as { server?: { getIn?: (path: string[]) => unknown } })
    .server;

  const value = server?.getIn?.([
    'server',
    'configuration',
    'statuses',
    'max_media_attachments',
  ]);

  return typeof value === 'number' && value > 0
    ? value
    : DEFAULT_MAX_MEDIA_ATTACHMENTS;
};
