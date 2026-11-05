import { createReducer } from '@reduxjs/toolkit';

import {
  threadHeadsFailed,
  threadHeadsLoaded,
  threadHeadsRequested,
} from 'mastodon/actions/thread_heads';

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
