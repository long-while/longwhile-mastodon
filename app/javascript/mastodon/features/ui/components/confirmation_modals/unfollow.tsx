/* eslint-disable @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-member-access
                  -- 이 저장소의 rootReducer 가 any 로 선언돼 있어 relationships
                     스토어의 타입이 해석되지 않는다. 같은 이유의 선례:
                     features/home_timeline/components/column_settings.tsx */
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
