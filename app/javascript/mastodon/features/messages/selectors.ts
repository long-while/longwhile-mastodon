// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//
//   이 저장소의 rootReducer 는 다중 계정 전환(RESET_ALL) 처리를 위해 `(state: any,
//   action: any)` 로 선언되어 있다. 그래서 RootState 가 해석되지 않고, 스토어에서
//   바로 읽으면 그 타입이 컴포넌트 안까지 번져 전부 unsafe 로 잡힌다.
//
//   우리가 실제로 읽는 조각만 여기서 형태를 선언하고, 스토어 접근을 이 파일 하나로
//   모은다. 상류가 rootReducer 의 타입을 되살리면 이 파일만 지우면 된다.

import type { Map as ImmutableMap } from 'immutable';

import type { Account } from 'mastodon/models/account';
import type { Status } from 'mastodon/models/status';
import type { AdminDmRoomsState } from 'mastodon/reducers/admin_dm_rooms';
import type { DmDraftsState } from 'mastodon/reducers/dm_drafts';
import type {
  DmMessagesState,
  DmRoomMessages,
} from 'mastodon/reducers/dm_messages';
import type { DmRoomsState } from 'mastodon/reducers/dm_rooms';

interface DmChatState {
  dmRooms: DmRoomsState;
  dmMessages: DmMessagesState;
  dmDrafts: DmDraftsState;
  accounts: ImmutableMap<string, Account>;
  statuses: ImmutableMap<string, Status>;
}

const asDmChatState = (state: unknown) => state as DmChatState;

export const selectDmRooms = (state: unknown): DmRoomsState =>
  asDmChatState(state).dmRooms;

export const selectDmRoom = (state: unknown, roomId: string | undefined) =>
  roomId ? selectDmRooms(state).rooms[roomId] : undefined;

// 내비 배지에 쓸 안 읽은 메시지 총합.
//
// **`order` 를 돌고 `rooms` 를 통째로 돌지 않는다.** `rooms` 에는 URL 로 직접 연
// 방(fetchDmRoom)도 들어 있는데, 나간 방을 그렇게 열면 서버 목록에는 없지만 맵에는
// 남는다. 그것까지 세면 목록에 보이지도 않는 방 때문에 배지가 켜진다.
export const selectUnreadDmCount = (state: unknown): number => {
  const { rooms, order } = selectDmRooms(state);

  return order.reduce((sum, id) => sum + (rooms[id]?.unread_count ?? 0), 0);
};

export const selectDmRoomMessages = (
  state: unknown,
  roomId: string | undefined,
): DmRoomMessages | undefined =>
  roomId ? asDmChatState(state).dmMessages[roomId] : undefined;

// 방별 초안. 목록의 "임시저장: …" 미리보기와 입력창 복원이 함께 읽는다.
export const selectDmDrafts = (state: unknown): DmDraftsState =>
  asDmChatState(state).dmDrafts;

export const selectMessageAccount = (
  state: unknown,
  accountId: string | undefined,
): Account | undefined =>
  accountId ? asDmChatState(state).accounts.get(accountId) : undefined;

// 계정 맵 통째로. **여러 계정을 한 번에 읽어야 할 때 이것을 쓴다.**
//
// `useAppSelector` 는 참조 비교라, 셀렉터가 매번 새 배열을 만들면 **디스패치마다
// 리렌더된다.** 스트림이 도는 화면에서는 그게 초당 몇 번이다. 맵은 참조가
// 안정적이므로 그것을 받아 useMemo 로 뽑는다.
export const selectMessageAccountsMap = (
  state: unknown,
): ImmutableMap<string, Account> => asDmChatState(state).accounts;

export const selectMessageStatuses = (
  state: unknown,
): ImmutableMap<string, Status> => asDmChatState(state).statuses;

// 첨부 개수 상한. 서버가 인스턴스 설정으로 내려주는 값이라 하드코딩하면
// 운영자가 늘려도 화면이 막는다. 아직 안 받았을 때만 상류 기본값을 쓴다.
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

// 운영진 DM 열람(/messages/all). 일반 채팅과 저장소를 따로 둔다 — 같은 곳을 쓰면
// 운영진 화면을 한 번 열었을 때 남의 방이 자기 대화 목록에 섞인다.
export const selectAdminDmRooms = (state: unknown): AdminDmRoomsState =>
  (state as { adminDmRooms: AdminDmRoomsState }).adminDmRooms;

export const selectAdminDmRoom = (state: unknown, roomId: string | undefined) =>
  roomId ? selectAdminDmRooms(state).rooms[roomId] : undefined;

export const selectAdminDmRoomMessages = (
  state: unknown,
  roomId: string | undefined,
) => (roomId ? selectAdminDmRooms(state).messages[roomId] : undefined);
