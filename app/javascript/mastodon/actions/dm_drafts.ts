// @_longwhile custom feature

import { createAction } from '@reduxjs/toolkit';

import { writeDraft } from 'mastodon/features/messages/util/drafts';
import { me } from 'mastodon/initial_state';
import { createThunk } from 'mastodon/store/typed_functions';

export const setDmDraft = createAction<{ roomId: string; text: string }>(
  'dm_drafts/set',
);

export const saveDmDraft = createThunk(
  'dm_drafts/save',
  ({ roomId, text }: { roomId: string; text: string }, { dispatch }) => {
    writeDraft(me, roomId, text);
    dispatch(setDmDraft({ roomId, text }));
  },
);
