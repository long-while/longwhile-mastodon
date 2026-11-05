// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방별 초안. 근거: dm-chat-phase-3.md §4

import { createAction } from '@reduxjs/toolkit';

import { writeDraft } from 'mastodon/features/messages/util/drafts';
import { me } from 'mastodon/initial_state';
import { createThunk } from 'mastodon/store/typed_functions';

export const setDmDraft = createAction<{ roomId: string; text: string }>(
  'dm_drafts/set',
);

// 초안을 리덕스와 로컬 저장소 양쪽에 쓴다.
//
// 둘 다 필요하다. 목록의 "임시저장: …" 미리보기는 리덕스를 읽어야 즉시 갱신되고,
// 새로고침 뒤에도 남으려면 로컬 저장소여야 한다. 한 곳에서 함께 써야 두 값이
// 어긋나지 않는다.
export const saveDmDraft = createThunk(
  'dm_drafts/save',
  ({ roomId, text }: { roomId: string; text: string }, { dispatch }) => {
    writeDraft(me, roomId, text);
    dispatch(setDmDraft({ roomId, text }));
  },
);
