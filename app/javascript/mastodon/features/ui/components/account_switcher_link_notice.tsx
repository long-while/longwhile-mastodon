import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { Icon } from 'mastodon/components/icon';

const messages = defineMessages({
  dropped: {
    id: 'account_switcher.link_notice.dropped',
    defaultMessage:
      'A security update unlinked {count, plural, one {# account} other {# accounts}} saved on this device. Use "Add another account" to add {count, plural, one {it} other {them}} again.',
  },
  failed: {
    id: 'account_switcher.link_notice.failed',
    defaultMessage:
      'Could not check the saved accounts. Check your connection, then open this again.',
  },
  dismiss: {
    id: 'account_switcher.link_notice.dismiss',
    defaultMessage: 'Dismiss',
  },
});

export interface AccountLinkNoticeProps {
  droppedCount: number;
  linksFailed: boolean;
  onDismiss: () => void;
}

export const AccountLinkNotice: React.FC<AccountLinkNoticeProps> = ({
  droppedCount,
  linksFailed,
  onDismiss,
}) => {
  const intl = useIntl();

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (droppedCount <= 0) {
    return null;
  }

  if (linksFailed) {
    return (
      <div
        className='account-switcher-link-notice account-switcher-link-notice--error'
        role='status'
      >
        <p className='account-switcher-link-notice__text'>
          {intl.formatMessage(messages.failed)}
        </p>
      </div>
    );
  }

  return (
    <div className='account-switcher-link-notice' role='status'>
      <p className='account-switcher-link-notice__text'>
        {intl.formatMessage(messages.dropped, { count: droppedCount })}
      </p>
      <button
        type='button'
        className='account-switcher-link-notice__dismiss'
        onClick={handleDismiss}
        aria-label={intl.formatMessage(messages.dismiss)}
      >
        <Icon id='close' icon={CloseIcon} />
      </button>
    </div>
  );
};
