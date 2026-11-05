// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방별 초안. 로컬 저장소가 원본이고 여기는 화면이 읽는 사본이다.
//   근거: dm-chat-phase-3.md §4
//
//   초기값을 저장소에서 읽어 채운다. 그래야 새로고침 직후에도 목록에
//   "임시저장: …" 이 그대로 보인다 — 방을 열어야 복원되면, 초안을 남긴 방을
//   찾으려고 방마다 들어가 봐야 한다.

import { createReducer } from '@reduxjs/toolkit';

import { readDrafts } from 'mastodon/features/messages/util/drafts';
import { me } from 'mastodon/initial_state';

import { setDmDraft } from '../actions/dm_drafts';
import { leaveDmRoom } from '../actions/dm_rooms';

export type DmDraftsState = Record<string, string>;

const initialState: DmDraftsState = readDrafts(me);

const without = (state: DmDraftsState, roomId: string) =>
  Object.fromEntries(
    Object.entries(state).filter(([id]) => id !== roomId),
  ) as DmDraftsState;

export const dmDraftsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(setDmDraft, (state, { payload }) => {
      if (payload.text.trim() === '') return without(state, payload.roomId);

      state[payload.roomId] = payload.text;

      return state;
    })
    // 나간 방의 초안은 남길 이유가 없다. 목록에서 사라진 방의 초안은 되살릴
    // 방법도 없다.
    .addCase(leaveDmRoom.fulfilled, (state, { payload }) =>
      without(state, payload.roomId),
    );
});
