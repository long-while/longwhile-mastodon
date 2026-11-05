import { createReducer } from '@reduxjs/toolkit';

import {
  threadHeadsFailed,
  threadHeadsLoaded,
  threadHeadsRequested,
} from 'mastodon/actions/thread_heads';

// 답글 id → 타래 시작 글. 키가 있으면 이미 물어본 것이다(다시 묻지 않는다).
//   'pending' — 묻는 중
//   'none'    — 시작 글 없음(답글이 아니거나 볼 수 있는 조상이 없음) 또는 요청 실패
//   { headId, omitted } — 시작 글과 그 사이에 생략된 글 수
export type ThreadHeadState =
  | 'pending'
  | 'none'
  | { headId: string; omitted: number };

const initialState: Record<string, ThreadHeadState> = {};

export const threadHeadsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(threadHeadsRequested, (state, { payload }) => {
      payload.ids.forEach((id) => {
        state[id] = 'pending';
      });
    })
    .addCase(threadHeadsLoaded, (state, { payload }) => {
      payload.ids.forEach((id) => {
        state[id] = 'none';
      });
      payload.entries.forEach(({ statusId, headId, omitted }) => {
        state[statusId] = { headId, omitted };
      });
    })
    .addCase(threadHeadsFailed, (state, { payload }) => {
      payload.ids.forEach((id) => {
        state[id] = 'none';
      });
    });
});
