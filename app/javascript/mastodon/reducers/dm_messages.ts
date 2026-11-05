// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방별 메시지 id 배열. 본문은 기존 statuses 리듀서에 들어간다.
//
//   **오름차순(오래된 것이 앞)으로 저장한다.** API 는 시간 역순으로 주지만 화면은
//   위에서 아래로 시간순이라, 렌더할 때마다 뒤집는 것보다 저장 시점에 정규화하는
//   편이 낫다. (dm-chat-phase-2.md §2)

import { createReducer } from '@reduxjs/toolkit';

import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import {
  discardDmMessage,
  fetchDmRoomStatuses,
  hideDmMessage,
  sendDmMessage,
} from '../actions/dm_rooms';
import { timelineDelete } from '../actions/timelines_typed';


// 아직 서버에 없는 내 메시지. 전송 버튼을 누른 순간 그려지고, 응답이 오면
// 사라진다(그 자리는 진짜 status 가 대신한다). 실패하면 실패 상태로 남아
// 재시도·삭제를 기다린다. (dm-chat-phase-3.md §3)
export interface PendingDmMessage {
  localId: string;

  // 재시도에도 같은 값을 쓴다. 그래야 첫 요청이 사실은 성공했던 경우 서버가
  // 중복을 만들지 않는다. (기획서 §11.4)
  idempotencyKey: string;

  text: string;
  createdAt: string;
  inReplyToId?: string;

  // 이미 서버에 올라간 첨부의 id. 재시도에 그대로 다시 쓴다.
  //
  // **미리보기 이미지는 들지 않는다.** 그 URL 은 입력창이 만든 objectURL 이라
  // 입력창을 비우는 순간 해제된다(use_uploads 의 reset). 낙관적 말풍선까지
  // 살려두려면 해제 시점을 리덕스 상태에 맞춰 관리해야 하는데, 실패한 메시지는
  // 사용자가 지울 때까지 남으므로 그 수명이 열려 있다. 대신 "사진 n장" 으로
  // 알린다 — 잠깐이고, 성공하면 진짜 첨부가 그 자리에 온다.
  mediaIds?: string[];

  recipientAccts: string[];
  recipientIds: string[];

  state: 'sending' | 'failed';

  // 속도 제한(429)에 걸린 실패. 같은 "실패" 라도 재시도가 소용없다는 것이
  // 전달돼야 해서 문구를 나눈다. (§3.5, US-10)
  rateLimited?: boolean;
}

export interface DmRoomMessages {
  statusIds: string[];
  pending: PendingDmMessage[];
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  loaded: boolean;
}

export type DmMessagesState = Record<string, DmRoomMessages>;

const initialState: DmMessagesState = {};

const emptyRoom = (): DmRoomMessages => ({
  statusIds: [],
  pending: [],
  hasMore: true,
  isLoading: false,
  hasError: false,
  loaded: false,
});

const merge = (existing: string[], incoming: string[]) =>
  Array.from(new Set([...existing, ...incoming])).sort(compareIds);

// 속도 제한인지. axios 오류의 응답 코드를 본다 — 여기까지 오는 error 는
// createThunk 가 rejectWithValue 로 감싼 것이다.
const isRateLimited = (error: unknown) =>
  (error as { response?: { status?: number } } | undefined)?.response?.status ===
  429;

export const dmMessagesReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchDmRoomStatuses.pending, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = true;
      room.hasError = false;
    })
    .addCase(fetchDmRoomStatuses.rejected, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      room.isLoading = false;
      room.hasError = true;
    })
    .addCase(fetchDmRoomStatuses.fulfilled, (state, { payload }) => {
      const room = (state[payload.roomId] ??= emptyRoom());

      room.isLoading = false;
      room.hasError = false;
      room.loaded = true;
      room.statusIds = merge(room.statusIds, payload.statusIds);

      // hasMore 는 과거 방향에만 뜻이 있다. 새 메시지를 받아오는 호출이 그것을
      // 뒤집어 과거 로딩을 멈춰 버리면 안 된다.
      if (payload.mode !== 'append') {
        room.hasMore = payload.hasMore;
      }
    })
    // 낙관적 반영. 버튼을 누른 순간 말풍선이 생긴다. (§3.1)
    //
    // 재시도도 이 액션이므로, 이미 있는 localId 면 새로 만들지 않고 상태만
    // '보내는 중' 으로 되돌린다. 새로 넣으면 실패한 것과 재시도한 것이 두 개로
    // 보인다.
    .addCase(sendDmMessage.pending, (state, { meta }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      const existing = room.pending.find(
        (entry) => entry.localId === meta.arg.localId,
      );

      if (existing) {
        existing.state = 'sending';
        existing.rateLimited = false;
        return;
      }

      room.pending.push({
        localId: meta.arg.localId,
        idempotencyKey: meta.arg.idempotencyKey,
        text: meta.arg.text,
        createdAt: meta.arg.createdAt,
        inReplyToId: meta.arg.inReplyToId,
        mediaIds: meta.arg.mediaIds,
        recipientAccts: meta.arg.recipientAccts,
        recipientIds: meta.arg.recipientIds,
        state: 'sending',
      });
    })
    .addCase(sendDmMessage.fulfilled, (state, { payload, meta }) => {
      const room = (state[payload.roomId] ??= emptyRoom());

      // 진짜 status 가 들어오는 것과 낙관적 말풍선이 사라지는 것이 **같은
      // 액션**이어야 한다. 두 번에 나누면 그 사이 한 프레임 동안 메시지가
      // 사라졌다 나타나거나 두 개로 보인다.
      room.statusIds = merge(room.statusIds, payload.statusIds);
      room.pending = room.pending.filter(
        (entry) => entry.localId !== meta.arg.localId,
      );
    })
    // 실패해도 말풍선은 남긴다. **입력창으로 되돌리지 않는다** — 화면과 입력창
    // 양쪽에 같은 글이 있으면 어느 쪽이 진짜인지 알 수 없다. (§3.3, 기획서 §4.4.2)
    .addCase(sendDmMessage.rejected, (state, { meta, payload }) => {
      const room = (state[meta.arg.roomId] ??= emptyRoom());
      const entry = room.pending.find(
        (item) => item.localId === meta.arg.localId,
      );

      if (!entry) return;

      entry.state = 'failed';
      entry.rateLimited = isRateLimited(payload?.error);
    })
    .addCase(discardDmMessage, (state, { payload }) => {
      const room = state[payload.roomId];

      if (!room) return;

      room.pending = room.pending.filter(
        (entry) => entry.localId !== payload.localId,
      );
    })
    // "나에게서만 삭제" (B-06). 이 방의 배열에서만 뺀다.
    //
    // `timelineDelete` 를 쓰지 않는다. 그것은 **글이 사라졌다**는 뜻이라 다른
    // 타임라인과 전역 statuses 까지 함께 정리하는데, 여기서 사라진 것은 내
    // 화면에서뿐이다. 상대에게도 운영진 화면에도 글은 그대로 있다.
    //
    // 서버 응답을 받은 뒤에 뺀다(pending 이 아니라 fulfilled). 낙관적으로 빼면
    // 실패했을 때 되돌릴 자리가 없다 — 그 글을 다시 받아오려면 방 전체를 다시
    // 읽어야 하고, 그 사이 화면에는 지워진 것처럼 보인다.
    .addCase(hideDmMessage.fulfilled, (state, { payload }) => {
      const room = state[payload.roomId];

      if (!room?.statusIds.includes(payload.statusId)) return;

      room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
    })
    // 지운 메시지의 id 를 남겨두지 않는다. statuses 리듀서가 본문을 지우므로
    // 화면에서는 어차피 사라지지만, 배열에 남으면 방을 오래 열어둘수록 죽은 id 가
    // 쌓이고 "여기까지 읽음" 위치 계산이 없는 메시지를 기준으로 잡는다.
    .addCase(timelineDelete, (state, { payload }) => {
      Object.values(state).forEach((room) => {
        // 실제로 든 방만 건드린다. 무조건 대입하면 Immer 가 수정으로 보고 모든
        // 방의 배열 identity 를 새로 만든다. 그러면 DM 과 상관없는 공개 타임라인
        // 글 하나가 지워질 때마다 열려 있는 방의 말풍선이 전부 다시 그려진다.
        if (!room.statusIds.includes(payload.statusId)) return;

        room.statusIds = room.statusIds.filter((id) => id !== payload.statusId);
      });
    });
});
