// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방 목록. 정규화한 방 맵 + 정렬된 id 배열 + 다음 페이지 커서.

import { createReducer } from '@reduxjs/toolkit';

import type {
  ApiDmReadStateJSON,
  ApiDmRoomJSON,
} from 'mastodon/api_types/dm_rooms';
import { compareIds } from 'mastodon/features/messages/util/compare_ids';

import {
  createDmRoom,
  fetchDmRoom,
  fetchDmRooms,
  leaveDmRoom,
  markDmRoomRead,
  setActiveDmRoom,
  addDmRoomMembers,
  removeDmRoomMember,
  setDmRoomNickname,
  setDmRoomTitle,
  setDmStreamConnected,
  updateDmReadState,
} from '../actions/dm_rooms';

export interface DmRoomsState {
  rooms: Record<string, ApiDmRoomJSON>;
  order: string[];
  next?: string;
  isLoading: boolean;
  loaded: boolean;

  // 지금 열려 있는 방. 스트림 처리기가 어느 방을 다시 읽을지 판단하는 데 쓴다.
  activeRoomId?: string;

  // 실시간 수신이 붙어 있는지. 끊기면 화면에 알린다. (§7)
  streamConnected: boolean;

  // 빈 목록과 실패한 목록은 다른 화면을 보여줘야 한다. "대화가 없습니다" 는
  // 요청이 실패했을 때 하는 말로는 거짓말이다.
  hasError: boolean;
}

const initialState: DmRoomsState = {
  rooms: {},
  order: [],
  next: undefined,
  isLoading: false,
  loaded: false,
  hasError: false,
  activeRoomId: undefined,

  // 구독하기 전에는 "끊김" 으로 보지 않는다. 이 화면에 들어오지도 않은 상태를
  // 오류로 알리면 안 된다.
  streamConnected: true,
};

// 목록 정렬은 서버가 정한다(마지막 메시지 역순). 여기서 다시 정렬하지 않는다 —
// 읽지 않음을 위로 올리는 식으로 순서가 자주 바뀌면 사용자가 위치를 기억할 수 없다.
//
// 방 하나를 받아온 것만으로 목록 순서를 건드리지 않는다. 나간 방을 URL 로 열면
// fetchDmRoom 이 도는데, 그것이 목록에 다시 꽂으면 서버는 여전히 숨김인데 화면에만
// 되살아난다. 순서는 목록 요청의 응답으로만 바뀐다.
// 읽음 커서는 **앞으로만 간다.** 서버 모델(DmRoomRead#advance_to!)이 그렇듯 여기서도
// 그래야 한다. 스트림 이벤트와 목록 응답은 순서를 바꿔 도착할 수 있고, 그때 뒤로
// 물러나면 "읽음" 이 붙었다 사라졌다 깜빡인다.
//
// **빈 배열은 그대로 받아들인다.** 상호주의가 꺼진 상태를 뜻하므로 이전 값을 남기면
// 끈 사람의 읽음이 화면에 계속 남는다. 누가 목록에 있는가는 늘 서버가 정하고,
// 어디까지 읽었는가만 뒤로 가지 않게 막는다.
// 커서 비교. null 은 **한 번도 읽지 않음**이라 어떤 id 보다도 뒤에 있다.
// 돌려주는 값은 `a` 가 `b` 보다 앞서 있으면 양수다.
const compareCursors = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  return compareIds(a, b);
};

const mergeReadStates = (
  before: ApiDmReadStateJSON[] | undefined,
  next: ApiDmReadStateJSON[] | undefined,
): ApiDmReadStateJSON[] | undefined => {
  if (!next) return before;
  if (!before || before.length === 0) return next;

  return next.map((state) => {
    const previous = before.find(
      (candidate) => candidate.account_id === state.account_id,
    );

    if (!previous) return state;

    if (compareCursors(previous.last_read_status_id, state.last_read_status_id) <= 0) {
      return state;
    }

    // **값을 복사해 돌려준다.** `before` 는 immer 의 draft 라, 그 안의 객체를
    // 그대로 새 객체에 얹으면 draft 참조가 상태 바깥으로 새어 나갈 수 있다.
    return {
      account_id: previous.account_id,
      last_read_status_id: previous.last_read_status_id,
    };
  });
};

const store = (state: DmRoomsState, room: ApiDmRoomJSON) => {
  state.rooms[room.id] = {
    ...room,
    participant_read_states: mergeReadStates(
      state.rooms[room.id]?.participant_read_states,
      room.participant_read_states,
    ),
  };
};

export const dmRoomsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchDmRooms.pending, (state) => {
      state.isLoading = true;
      state.hasError = false;
    })
    .addCase(fetchDmRooms.rejected, (state) => {
      state.isLoading = false;
      state.hasError = true;
    })
    .addCase(fetchDmRooms.fulfilled, (state, { payload, meta }) => {
      state.isLoading = false;
      state.loaded = true;
      state.hasError = false;

      const ids = payload.rooms.map((room) => room.id);

      payload.rooms.forEach((room) => {
        store(state, room);
      });

      // **`meta.arg` 가 없을 수 있다.** 액션을 인자 없이 부르면
      // createAsyncThunk 가 `undefined` 를 그대로 싣는다. 여기서 바로 파고들면
      // 리듀서가 던지고, 실패한 것은 이 액션 하나가 아니라 **그 디스패치 전체**다
      // — 목록이 pending 인 채로 굳어 배지가 0 이 된다. 실제로 내비의 첫
      // 로딩(navigation_panel 의 MessagesLink)이 이렇게 죽어 있었다.
      const arg = meta.arg as { url?: string; refresh?: boolean } | undefined;

      // 스트림이 부른 갱신이면 **첫 페이지만 갈아 끼우고 뒤는 남긴다.** 통째로
      // 바꾸면 아래로 더 불러와 둔 방들이 사라져 스크롤이 갑자기 짧아진다.
      if (arg?.refresh) {
        state.order = [...ids, ...state.order.filter((id) => !ids.includes(id))];

        // next 는 건드리지 않는다. 이미 3페이지까지 받아둔 사람에게 1페이지의
        // 커서를 다시 주면 "더 보기" 가 받아둔 곳을 다시 받는다.
        state.next ??= payload.next;

        return;
      }

      state.next = payload.next;

      // url 이 있으면 다음 페이지를 이어 붙이는 것이고, 없으면 첫 페이지다.
      state.order = arg?.url
        ? [...state.order.filter((id) => !ids.includes(id)), ...ids]
        : ids;
    })
    .addCase(setActiveDmRoom, (state, { payload }) => {
      state.activeRoomId = payload.roomId;
    })
    .addCase(setDmStreamConnected, (state, { payload }) => {
      state.streamConnected = payload.connected;
    })
    .addCase(fetchDmRoom.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    // 새로 만든 방은 아직 메시지가 없어 서버 목록에 나오지 않는다. 사용자가 방금
    // 만든 것이므로 맨 위에 둔다.
    .addCase(createDmRoom.fulfilled, (state, { payload }) => {
      store(state, payload);

      if (!state.order.includes(payload.id)) {
        state.order.unshift(payload.id);
      }
    })
    .addCase(markDmRoomRead.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    // 제목 변경 (Phase 5). 목록 순서는 건드리지 않는다 — 서버가 정한다.
    .addCase(setDmRoomTitle.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    // 멤버 관리 (2026-08-12). 셋 다 응답이 갱신된 방이다.
    //
    // **방 id 는 바뀌지 않는다.** 서버가 participant_key 만 다시 계산해 같은 행에
    // 쓰므로, 열려 있는 화면의 URL 도 스크롤도 그대로다. 목록 순서도 건드리지
    // 않는다 — 멤버가 바뀌었다고 대화가 위로 올라올 이유는 없고, 안내 메시지가
    // 붙으면서 서버가 어차피 정렬을 갱신한다.
    .addCase(addDmRoomMembers.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    .addCase(removeDmRoomMember.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    .addCase(setDmRoomNickname.fulfilled, (state, { payload }) => {
      store(state, payload);
    })
    // 상대가 읽었다는 스트림 이벤트. (FR-18)
    //
    // **목록을 다시 읽지 않는다.** 읽음은 정렬·미리보기·안 읽은 개수를 바꾸지
    // 않는다. Phase 3 의 update 처럼 dmChatStreamUpdate() 를 부르면 상대가 스크롤할
    // 때마다 방 목록 전체를 다시 가져온다.
    //
    // 모르는 방의 이벤트는 버린다. 나간 방에도 이벤트는 정상적으로 오는데(나가기는
    // 숨김일 뿐 멤버십은 남는다), 그 방을 스토어에 되살리면 서버는 여전히 숨김인데
    // 화면에만 나타난다.
    .addCase(updateDmReadState, (state, { payload }) => {
      const room = state.rooms[payload.roomId];

      if (!room) return;

      const before = room.participant_read_states ?? [];
      const others = before.filter(
        (candidate) => candidate.account_id !== payload.accountId,
      );
      const previous = before.find(
        (candidate) => candidate.account_id === payload.accountId,
      );

      // 뒤로 가지 않는다. mergeReadStates 와 같은 이유다.
      if (
        previous &&
        compareCursors(previous.last_read_status_id, payload.lastReadStatusId) >=
          0
      ) {
        return;
      }

      // 서버는 **읽음 표시를 켜 둔 멤버만** 목록에 넣는다. 그 목록에 없는
      // 계정의 이벤트가 왔다면 상호주의로 가려진 사람이므로 더하지 않는다 —
      // 더하면 화면에서 세는 인원이 서버와 어긋난다.
      if (!previous) return;

      room.participant_read_states = [
        ...others,
        {
          account_id: payload.accountId,
          last_read_status_id: payload.lastReadStatusId,
        },
      ];
    })
    // 나가기는 목록에서만 지운다. 서버에서도 방과 메시지는 그대로 남아 있고,
    // 새 메시지가 오면 다시 나타난다. (FR-27)
    .addCase(leaveDmRoom.fulfilled, (state, { payload }) => {
      state.order = state.order.filter((id) => id !== payload.roomId);
      state.rooms = Object.fromEntries(
        Object.entries(state.rooms).filter(([id]) => id !== payload.roomId),
      );
    });
});
