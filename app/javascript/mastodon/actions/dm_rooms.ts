// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { createAction } from '@reduxjs/toolkit';

import {
  apiAddDmRoomMembers,
  apiCreateDmRoom,
  apiDeleteDmMessageForRedraft,
  apiEditDmMessage,
  apiHideDmMessage,
  apiSendDmMessage,
  apiGetDmRoom,
  apiGetDmRooms,
  apiGetDmRoomStatuses,
  apiLeaveDmRoom,
  apiMarkDmRoomRead,
  apiRemoveDmRoomMember,
  apiSetDmRoomNickname,
  apiSetDmRoomTitle,
} from 'mastodon/api/dm_rooms';
import {
  selectDmRoomMessages,
  selectDmRooms,
} from 'mastodon/features/messages/selectors';
import {
  createSendQueue,
  newerId,
} from 'mastodon/features/messages/util/reply_target';
import {
  createDataLoadingThunk,
  createThunk,
} from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';
import { deleteFromTimelines } from './timelines';

const enqueueDmSend = createSendQueue();

const responseStatusOf = (error: unknown) =>
  (error as { response?: { status?: number } } | undefined)?.response?.status;

const nextLinkOf = (links: { refs: { rel: string; uri: string }[] }) =>
  links.refs.find((link) => link.rel === 'next')?.uri;

// 지금 열려 있는 방. 스트림으로 새 메시지가 왔을 때 **어느 방을 다시 읽을지**
// 판단하는 데 쓴다. 컴포넌트가 들고 있으면 스트림 처리기가 알 방법이 없다.
export const setActiveDmRoom = createAction<{ roomId?: string }>(
  'dm_rooms/set_active',
);

// 실시간 수신이 붙어 있는지. 끊긴 동안에는 화면이 조용히 낡는다 — 사용자가
// 그것을 알아야 새로고침이라도 한다. (dm-chat-phase-3.md §7)
export const setDmStreamConnected = createAction<{ connected: boolean }>(
  'dm_rooms/set_stream_connected',
);

// 새 DM 이 도착했다. **소리를 내기 위해서만 있는 액션이다.**
//
//   리듀서는 이것을 듣지 않는다. 목록 갱신은 dmChatStreamUpdate 가 따로 하고,
//   여기서는 `meta.sound` 만 실어 보낸다 — store/middlewares/sounds.ts 가 그것을
//   보고 boop 을 재생한다(알림이 쓰는 것과 같은 소리·같은 경로).
//
//   알림에서 DM 을 뺐으므로(NotifyService) 그쪽 소리가 더는 울리지 않는다.
//   그 자리를 이것이 대신한다.
export const dmMessageReceived = createAction('dm_rooms/message_received', () => ({
  payload: undefined,
  meta: { sound: 'boop' },
}));

// 상대가 어디까지 읽었는지 바뀌었다. 스트림의 dm.read 이벤트가 부른다.
// (FR-18, docs/dm-chat/phases/dm-chat-phase-4.md §3.2)
//
// **목록 재조회로 잇지 말 것.** 읽음은 정렬·미리보기·안 읽은 개수를 바꾸지 않는다.
export const updateDmReadState = createAction<{
  roomId: string;
  accountId: string;
  lastReadStatusId: string;
}>('dm_rooms/update_read_state');

// 실패한 낙관적 메시지를 버린다. (dm-chat-phase-3.md §3.3)
export const discardDmMessage = createAction<{
  roomId: string;
  localId: string;
}>('dm_messages/discard');

// 계정은 공용 accounts 스토어에 넣어야 아바타·표시 이름이 그려진다. 방 응답에
// 딸려온 JSON 을 그대로 두면 목록의 아바타 자리가 통째로 빈다.
export const fetchDmRooms = createDataLoadingThunk(
  'dm_rooms/fetch',
  async ({ url }: { url?: string; refresh?: boolean } = {}) => {
    const { rooms, links } = await apiGetDmRooms(url);

    return { rooms, next: nextLinkOf(links) };
  },
  ({ rooms, next }, { dispatch }) => {
    dispatch(importFetchedAccounts(rooms.flatMap((room) => room.accounts)));

    return { rooms, next };
  },
  // 전역 로딩바를 쓰지 않는다. 스트림이 메시지마다 이 목록을 다시 읽으므로,
  // 켜 두면 대화가 오갈 때마다 화면 위에서 막대가 번쩍인다. 첫 로딩의 표시는
  // 목록 자신이 한다(ScrollableList 의 showLoading).
  { useLoadingBar: false },
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

// 방 제목 (Phase 5). 응답은 갱신된 방이라 리듀서가 그대로 store 한다.
export const setDmRoomTitle = createDataLoadingThunk(
  'dm_rooms/set_title',
  ({ roomId, title }: { roomId: string; title: string }) =>
    apiSetDmRoomTitle(roomId, title),
);

export const markDmRoomRead = createDataLoadingThunk(
  'dm_rooms/read',
  ({ roomId, statusId }: { roomId: string; statusId?: string }) =>
    apiMarkDmRoomRead(roomId, statusId),
  { useLoadingBar: false },
);

// 전송. **인자 전체가 낙관적 말풍선의 재료**다 — 리듀서가 .pending 에서
// meta.arg 를 그대로 읽어 말풍선을 만들고, .rejected 에서 그 말풍선을 실패 상태로
// 남긴다. 재시도는 같은 인자로 이 액션을 다시 부르는 것이고, 그러면 멱등성 키도
// 같아서 서버가 중복을 만들지 않는다. (dm-chat-phase-3.md §3)
export const sendDmMessage = createDataLoadingThunk(
  'dm_messages/send',
  ({
    roomId,
    text,
    inReplyToId,
    fallbackInReplyToId,
    recipientAccts,
    recipientIds,
    mediaIds,
    idempotencyKey,
  }: {
    roomId: string;
    text: string;

    // 누르는 순간 화면이 아는 최근 메시지. 실제로 다는 글은 앞선 전송이 끝난 뒤에
    // 정한다(reply_target.ts 의 createSendQueue).
    inReplyToId?: string;

    // 위 글이 그사이 지워졌을 때(404) 대신 달 글. 방의 루트다.
    fallbackInReplyToId?: string;
    recipientAccts: string[];
    recipientIds: string[];
    mediaIds?: string[];

    // 낙관적 말풍선의 신원. 서버 id 가 없는 동안 이것으로 찾는다.
    localId: string;
    idempotencyKey: string;
    createdAt: string;
  }) =>
    enqueueDmSend(roomId, async (previousSentId) => {
      const send = (target?: string) =>
        apiSendDmMessage({
          text,
          inReplyToId: target,
          recipientAccts,
          recipientIds,
          mediaIds,
          idempotencyKey,
        });

      const target = newerId(inReplyToId, previousSentId);

      try {
        return await send(target);
      } catch (error) {
        if (
          !target ||
          target === fallbackInReplyToId ||
          responseStatusOf(error) !== 404
        )
          throw error;

        return send(fallbackInReplyToId);
      }
    }),
  (status, { dispatch, actionArg }) => {
    dispatch(importFetchedStatuses([status]));

    return { roomId: actionArg.roomId, statusIds: [status.id] };
  },
);

// ── 멤버 관리 (2026-08-12) ─────────────────────────────────────────────────
//
// 셋 다 응답이 갱신된 방이라 `setDmRoomTitle` 과 같은 자리에 들어간다 —
// dm_rooms 리듀서가 fulfilled 페이로드를 방으로 보고 그대로 store 한다.

export const addDmRoomMembers = createDataLoadingThunk(
  'dm_rooms/add_members',
  ({ roomId, accountIds }: { roomId: string; accountIds: string[] }) =>
    apiAddDmRoomMembers(roomId, accountIds),
  (room, { dispatch }) => {
    dispatch(importFetchedAccounts(room.accounts));

    return room;
  },
);

export const removeDmRoomMember = createDataLoadingThunk(
  'dm_rooms/remove_member',
  ({ roomId, accountId }: { roomId: string; accountId: string }) =>
    apiRemoveDmRoomMember(roomId, accountId),
  (room, { dispatch }) => {
    dispatch(importFetchedAccounts(room.accounts));

    return room;
  },
);

export const setDmRoomNickname = createDataLoadingThunk(
  'dm_rooms/set_nickname',
  ({
    roomId,
    accountId,
    nickname,
  }: {
    roomId: string;
    accountId: string;
    nickname: string;
  }) => apiSetDmRoomNickname(roomId, accountId, nickname),
);

// ── 메시지 하나에 대한 동작 (컨텍스트 메뉴) ────────────────────────────────

// "나에게서만 삭제". 글은 남고 내 조회에서만 빠진다. 되돌리는 경로는 없다.
//
// 리듀서가 이 방의 id 배열에서 그 글을 뺀다. 전역 statuses 는 건드리지 않는다 —
// 글은 여전히 존재하고, 상대의 화면과 운영진 화면에는 그대로 있다.
export const hideDmMessage = createDataLoadingThunk(
  'dm_messages/hide',
  async ({ roomId, statusId }: { roomId: string; statusId: string }) => {
    await apiHideDmMessage(roomId, statusId);

    return { roomId, statusId };
  },
  { useLoadingBar: false },
);

// 수정. 응답은 갱신된 status 라 statuses 리듀서가 덮어쓰고, 말풍선이 그대로
// 다시 그려진다. 우리 id 배열은 바뀌지 않는다 — 같은 글이다.
export const editDmMessage = createDataLoadingThunk(
  'dm_messages/edit',
  ({
    statusId,
    text,
    recipientAccts,
    mediaIds,
  }: {
    roomId: string;
    statusId: string;
    text: string;
    recipientAccts: string[];
    mediaIds?: string[];
  }) => apiEditDmMessage({ statusId, text, recipientAccts, mediaIds }),
  (status, { dispatch }) => {
    dispatch(importFetchedStatuses([status]));

    return status;
  },
);

// "지우고 다시 쓰기". 지우면서 원문을 돌려받는다.
//
// 목록에서 빼는 일은 `deleteFromTimelines` 에 맡긴다 — 그것이 내는
// `timelineDelete` 를 우리 리듀서가 이미 듣고 있고, 기존 /conversations 화면의
// 타임라인에서도 같이 빠져야 한다. 여기서 따로 빼면 그쪽에 죽은 글이 남는다.
//
// 돌려받은 원문은 부르는 쪽(room.tsx)이 입력창에 넣는다. 여기서 넣지 않는 이유는
// 초안이 방과 함께 묶여 있어서다 — 리덕스에 넣으면 방을 옮긴 뒤에 되살아난다.
export const redraftDmMessage = createDataLoadingThunk(
  'dm_messages/redraft',
  ({ statusId }: { roomId: string; statusId: string }) =>
    apiDeleteDmMessageForRedraft(statusId),
  (status, { dispatch, actionArg }) => {
    dispatch(deleteFromTimelines(actionArg.statusId));

    return { roomId: actionArg.roomId, text: status.text ?? '' };
  },
);

// 메시지는 기존 statuses 리듀서에 넣고, 우리 리듀서는 id 배열만 든다. 그래야
// StatusContent·MediaGallery 같은 기존 컴포넌트를 그대로 쓸 수 있다.
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

      // 과거 페이지가 더 있는지. next 링크가 없으면 방의 처음까지 다 읽었다.
      hasMore: Boolean(nextLinkOf(links)),

      // 앞에 붙이는 로딩인지(과거) 뒤에 붙이는 로딩인지(신규) 구분한다.
      mode: actionArg.sinceId ? ('append' as const) : actionArg.maxId ? ('prepend' as const) : ('replace' as const),
    };
  },
  { useLoadingBar: false },
);

// 연속 수신을 묶는 간격. 한 사람이 여러 줄을 연달아 보내면 이벤트도 그만큼 오는데,
// 그때마다 왕복하면 요청이 몰린다.
const STREAM_REFRESH_DELAY = 400;

let streamRefreshTimer: ReturnType<typeof setTimeout> | undefined;

// 스트림으로 새 DM 이 도착했을 때 화면을 따라잡는다.
//
// **어느 방인지 알 수 없다.** direct 스트림은 계정 단위 단일 채널이고, 우리
// REST::StatusSerializer 는 conversation_id 도 dm_room_id 도 내리지 않는다. 서버에
// 필드를 더하는 A 안은 직렬화 경로 전체(타임라인·컨텍스트·검색)와 스트리밍의
// InlineRenderer 까지 건드려야 해서, **열린 방만 since_id 로 다시 읽는 C 안**을
// 쓴다. 다른 방으로 온 메시지면 응답이 비어 있을 뿐이라 안전하다.
// (dm-chat-phase-3.md §1.2)
//
// 목록은 방을 몰라도 통째로 다시 읽으면 된다. 그 한 번으로 읽지 않음 개수·정렬·
// 미리보기가 서버 값과 맞고, **나간 방의 재등장(FR-27)도 따로 코드를 두지 않고
// 해결된다** — 서버가 이미 그 방을 목록에 되돌려 놓았기 때문이다.
export const dmChatStreamUpdate = createThunk(
  'dm_rooms/stream_update',
  (_arg, { dispatch, getState }) => {
    if (streamRefreshTimer) clearTimeout(streamRefreshTimer);

    streamRefreshTimer = setTimeout(() => {
      streamRefreshTimer = undefined;

      void dispatch(fetchDmRooms({ refresh: true }));

      // 이 저장소의 rootReducer 는 RESET_ALL 처리를 위해 any 로 선언되어 있어
      // RootState 가 해석되지 않는다. 우리가 읽는 조각의 형태는 selectors.ts 가
      // 안다. (그 파일 머리말 참조)
      const state: unknown = getState();
      const roomId = selectDmRooms(state).activeRoomId;

      if (!roomId) return;

      const ids = selectDmRoomMessages(state, roomId)?.statusIds ?? [];

      // 아직 한 건도 못 받은 방이면 since_id 가 없다. 그때는 첫 페이지를 받는다.
      void dispatch(
        fetchDmRoomStatuses({ roomId, sinceId: ids[ids.length - 1] }),
      );
    }, STREAM_REFRESH_DELAY);
  },
);
