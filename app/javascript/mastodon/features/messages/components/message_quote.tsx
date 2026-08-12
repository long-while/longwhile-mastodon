// @_longwhile custom feature

import { useCallback, useMemo } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import type { Status } from 'mastodon/models/status';
import { useAppSelector } from 'mastodon/store';
import { unescapeHTML } from 'mastodon/utils/html';
import { stripLeadingMentions } from 'mastodon/utils/strip_leading_mentions';

import { selectMessageAccount } from '../selectors';

const PREVIEW_LIMIT = 120;

const messages = defineMessages({
  label: {
    id: 'messages.quote.label',
    defaultMessage: 'Replying to {name}: {text}. Go to the original message.',
  },
  unknownAuthor: {
    id: 'messages.quote.unknown_author',
    defaultMessage: 'Message',
  },
  unavailable: {
    id: 'messages.quote.unavailable',
    defaultMessage: 'Original message unavailable',
  },
});

interface Props {
  quotedId: string;
  quoted?: Status;

  memberUrls: Set<string>;

  onNavigate?: (statusId: string) => void;
}

export const MessageQuote: React.FC<Props> = ({
  quotedId,
  quoted,
  memberUrls,
  onNavigate,
}) => {
  const intl = useIntl();
  const accountId = quoted?.get('account') as string | undefined;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const preview = useMemo(() => {
    if (!quoted) return null;

    const warning = quoted.get('spoiler_text') as string | undefined;

    if (warning) return warning;

    const html = quoted.get('contentHtml') as string | undefined;
    const text = html ? unescapeHTML(stripLeadingMentions(html, memberUrls)) : '';

    if (!text) return null;

    const flattened = text.replace(/\s+/g, ' ').trim();

    return flattened.length > PREVIEW_LIMIT
      ? `${flattened.slice(0, PREVIEW_LIMIT)}…`
      : flattened;
  }, [memberUrls, quoted]);

  const handleClick = useCallback(() => {
    onNavigate?.(quotedId);
  }, [onNavigate, quotedId]);

  const authorName = account
    ? account.display_name.length > 0
      ? account.display_name
      : account.username
    : undefined;

  return (
    <button
      type='button'
      className='dm-message__quote'
      aria-label={intl.formatMessage(messages.label, {
        name: authorName ?? intl.formatMessage(messages.unknownAuthor),
        text: preview ?? intl.formatMessage(messages.unavailable),
      })}
      onClick={handleClick}
    >
      <span className='dm-message__quote__author'>
        {account ? (
          account.display_name || account.username
        ) : (
          <FormattedMessage
            id='messages.quote.unknown_author'
            defaultMessage='Message'
          />
        )}
      </span>

      <span className='dm-message__quote__text'>
        {preview ?? (
          <FormattedMessage
            id='messages.quote.unavailable'
            defaultMessage='Original message unavailable'
          />
        )}
      </span>
    </button>
  );
};
