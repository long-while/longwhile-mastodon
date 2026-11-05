// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   나가기 확인 대화. 목록과 방 헤더 두 곳에서 같은 문구를 쓴다.
//   근거: dm-chat-decisions.md D-05

import type { IntlShape } from 'react-intl';
import { defineMessages } from 'react-intl';

import { saveDmDraft } from 'mastodon/actions/dm_drafts';
import { leaveDmRoom } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import type { AppDispatch } from 'mastodon/store';

const messages = defineMessages({
  title: {
    id: 'confirmations.leave_dm_room.title',
    defaultMessage: 'Leave this conversation?',
  },
  // 실제 동작이 "숨김" 이라는 것을 반드시 적는다. "삭제" 로 읽히면 상대에게도
  // 지워졌다고 오해하고, DM 에서 그 오해는 사고가 된다.
  message: {
    id: 'confirmations.leave_dm_room.message',
    defaultMessage:
      'The messages are not deleted, and the conversation comes back if you receive a new message.',
  },
  confirm: {
    id: 'confirmations.leave_dm_room.confirm',
    defaultMessage: 'Leave',
  },
});

export const confirmLeaveRoom = (
  dispatch: AppDispatch,
  intl: IntlShape,
  roomId: string,
  onLeft?: () => void,
) => {
  dispatch(
    openModal({
      modalType: 'CONFIRM',
      modalProps: {
        title: intl.formatMessage(messages.title),
        message: intl.formatMessage(messages.message),
        confirm: intl.formatMessage(messages.confirm),
        onConfirm: () => {
          // 낙관적으로 지우지 않는다. 실패했는데 사라지면 사용자는 나갔다고 믿는다.
          // 리듀서가 .fulfilled 에서만 목록을 지우므로, 실패하면 방은 그대로 남는다.
          void dispatch(leaveDmRoom({ roomId }));

          // 저장소에 남은 초안도 지운다. 리듀서는 .fulfilled 에서 자기 사본만
          // 지우므로, 이것이 없으면 새로고침한 뒤 나간 방의 초안이 되살아난다.
          void dispatch(saveDmDraft({ roomId, text: '' }));
          onLeft?.();
        },
      },
    }),
  );
};
