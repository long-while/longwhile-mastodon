import { useCallback } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { unfollowAccount } from 'mastodon/actions/accounts';
import type { Account } from 'mastodon/models/account';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import type { BaseConfirmationModalProps } from './confirmation_modal';
import { ConfirmationModal } from './confirmation_modal';

const messages = defineMessages({
  unfollowTitle: {
    id: 'confirmations.unfollow.title',
    defaultMessage: 'Unfollow user?',
  },
  unfollowConfirm: {
    id: 'confirmations.unfollow.confirm',
    defaultMessage: 'Unfollow',
  },
  // @_longwhile — 아직 팔로우가 아닌 상태에서 누른 경우. 끊을 관계가 없으므로
  // "언팔로우" 라고 물으면 사용자가 자기 상태를 잘못 이해한다.
  cancelTitle: {
    id: 'confirmations.cancel_follow_request.title',
    defaultMessage: 'Cancel follow request?',
  },
  cancelConfirm: {
    id: 'confirmations.cancel_follow_request.confirm',
    defaultMessage: 'Cancel request',
  },
});

export const ConfirmUnfollowModal: React.FC<
  {
    account: Account;
  } & BaseConfirmationModalProps
> = ({ account, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  // 요청만 걸린 상태인지. 취소 동작은 언팔로우와 같은 엔드포인트라 문구만 가른다.
  const requested = useAppSelector((state) =>
    Boolean(state.relationships.getIn([account.id, 'requested'])),
  );

  const onConfirm = useCallback(() => {
    dispatch(unfollowAccount(account.id));
  }, [dispatch, account.id]);

  return (
    <ConfirmationModal
      title={intl.formatMessage(
        requested ? messages.cancelTitle : messages.unfollowTitle,
      )}
      message={
        requested ? (
          <FormattedMessage
            id='confirmations.cancel_follow_request.message'
            defaultMessage='Withdraw your follow request to {name}?'
            values={{ name: <strong>@{account.acct}</strong> }}
          />
        ) : (
          <FormattedMessage
            id='confirmations.unfollow.message'
            defaultMessage='Are you sure you want to unfollow {name}?'
            values={{ name: <strong>@{account.acct}</strong> }}
          />
        )
      }
      confirm={intl.formatMessage(
        requested ? messages.cancelConfirm : messages.unfollowConfirm,
      )}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};
