// @_longwhile custom feature

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
    .addCase(leaveDmRoom.fulfilled, (state, { payload }) =>
      without(state, payload.roomId),
    );
});
