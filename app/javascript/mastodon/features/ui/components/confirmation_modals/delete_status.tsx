import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { deleteStatus } from 'mastodon/actions/statuses';
import { useAppDispatch } from 'mastodon/store';

import type { BaseConfirmationModalProps } from './confirmation_modal';
import { ConfirmationModal } from './confirmation_modal';

const messages = defineMessages({
  deleteAndRedraftTitle: {
    id: 'confirmations.redraft.title',
    defaultMessage: 'Delete & redraft post?',
  },
  deleteAndRedraftMessage: {
    id: 'confirmations.redraft.message',
    defaultMessage:
      'Are you sure you want to delete this status and re-draft it? Favorites and boosts will be lost, and replies to the original post will be orphaned.',
  },
  deleteAndRedraftConfirm: {
    id: 'confirmations.redraft.confirm',
    defaultMessage: 'Delete & redraft',
  },
  deleteTitle: {
    id: 'confirmations.delete.title',
    defaultMessage: 'Delete post?',
  },
  deleteMessage: {
    id: 'confirmations.delete.message',
    defaultMessage: 'Are you sure you want to delete this status?',
  },
  deleteConfirm: {
    id: 'confirmations.delete.confirm',
    defaultMessage: 'Delete',
  },
});

export const ConfirmDeleteStatusModal: React.FC<
  {
    statusId: string;
    withRedraft: boolean;
  } & BaseConfirmationModalProps
> = ({ statusId, withRedraft, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const onConfirm = useCallback(() => {
    dispatch(deleteStatus(statusId, withRedraft));
  }, [dispatch, statusId, withRedraft]);

  return (
    <ConfirmationModal
      title={intl.formatMessage(
        withRedraft ? messages.deleteAndRedraftTitle : messages.deleteTitle,
      )}
      message={intl.formatMessage(
        withRedraft ? messages.deleteAndRedraftMessage : messages.deleteMessage,
      )}
      confirm={intl.formatMessage(
        withRedraft ? messages.deleteAndRedraftConfirm : messages.deleteConfirm,
      )}
      onConfirm={onConfirm}
      onClose={onClose}
      // @_longwhile — 삭제는 되돌릴 수 없다. 확인 단추를 빨강으로 둔다.
      //   테마가 `.button` 의 배경을 덮으면서 상류의 위험 단추까지 파랗게
      //   만들었던 것은 35ab8c1035 에서 되돌려 두었으므로, 여기서는 플래그만
      //   넘기면 된다.
      //   "지우고 다시 쓰기" 도 원본을 지우므로 같이 붙는다.
      dangerous
    />
  );
};
