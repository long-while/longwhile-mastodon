// @_longwhile custom feature

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
          void dispatch(leaveDmRoom({ roomId }));

          void dispatch(saveDmDraft({ roomId, text: '' }));
          onLeft?.();
        },
      },
    }),
  );
};
