// @_longwhile custom feature

import { useCallback } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import HourglassIcon from '@/material-icons/400-24px/hourglass.svg?react';
import WarningIcon from '@/material-icons/400-24px/warning.svg?react';
import { Icon } from 'mastodon/components/icon';
import type { PendingDmMessage } from 'mastodon/reducers/dm_messages';

const messages = defineMessages({
  sending: { id: 'messages.pending.sending', defaultMessage: 'Sending…' },
  failed: { id: 'messages.pending.failed', defaultMessage: 'Not sent' },
  rateLimited: {
    id: 'messages.pending.rate_limited',
    defaultMessage: 'Too many messages. Try again in a little while.',
  },
  retry: { id: 'messages.pending.retry', defaultMessage: 'Try again' },
  discard: { id: 'messages.pending.discard', defaultMessage: 'Delete' },
});

interface Props {
  pending: PendingDmMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;

  isSenderChanged: boolean;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
}

export const PendingBubble: React.FC<Props> = ({
  pending,
  isFirstInGroup,
  isLastInGroup,
  isSenderChanged,
  onRetry,
  onDiscard,
}) => {
  const intl = useIntl();

  const handleRetry = useCallback(() => {
    onRetry(pending.localId);
  }, [onRetry, pending.localId]);

  const handleDiscard = useCallback(() => {
    onDiscard(pending.localId);
  }, [onDiscard, pending.localId]);

  const failed = pending.state === 'failed';
  const mediaCount = pending.mediaIds?.length ?? 0;

  return (
    <div
      className={classNames('dm-message', 'dm-message--mine', {
        'dm-message--first': isFirstInGroup,
        'dm-message--last': isLastInGroup,
        'dm-message--sender-changed': isSenderChanged,
        'dm-message--pending': !failed,
        'dm-message--failed': failed,
      })}
    >
      <span className='dm-message__sr-label'>
        {intl.formatMessage(failed ? messages.failed : messages.sending)}
      </span>

      <div className='dm-message__body'>
        {pending.text.trim() !== '' && (
          <div className='dm-message__bubble'>{pending.text}</div>
        )}

        {mediaCount > 0 && (
          <div className='dm-message__pending-media'>
            <FormattedMessage
              id='messages.pending.attachments'
              defaultMessage='{count, plural, other {# attachments}}'
              values={{ count: mediaCount }}
            />
          </div>
        )}

        <div
          className={classNames('dm-message__state', {
            'dm-message__state--failed': failed,
          })}
        >
          {failed ? (
            <>
              <Icon id='exclamation-circle' icon={WarningIcon} />

              <span>
                {intl.formatMessage(
                  pending.rateLimited ? messages.rateLimited : messages.failed,
                )}
              </span>

              <button type='button' onClick={handleRetry}>
                {intl.formatMessage(messages.retry)}
              </button>

              <button type='button' onClick={handleDiscard}>
                {intl.formatMessage(messages.discard)}
              </button>
            </>
          ) : (
            <Icon
              id='clock'
              icon={HourglassIcon}
              title={intl.formatMessage(messages.sending)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
