// @_longwhile custom feature

import { useCallback, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, FormattedTime, useIntl } from 'react-intl';

import classNames from 'classnames';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import { openModal } from 'mastodon/actions/modal';
import { Avatar } from 'mastodon/components/avatar';
import { ContentWarning } from 'mastodon/components/content_warning';
import MediaGalleryRaw from 'mastodon/components/media_gallery';
import StatusContentRaw from 'mastodon/components/status_content';
import type { Status } from 'mastodon/models/status';
import { useAppDispatch, useAppSelector } from 'mastodon/store';
import { stripLeadingMentions } from 'mastodon/utils/strip_leading_mentions';

import { selectMessageAccount } from '../selectors';

import { MessageMenu } from './message_menu';
import { MessageQuote } from './message_quote';

const StatusContent = StatusContentRaw as unknown as React.ComponentType<{
  status: Status;
  statusContent?: string;
}>;

const MediaGallery = MediaGalleryRaw as unknown as React.ComponentType<{
  media: unknown;
  sensitive?: boolean;
  lang?: string;
  onOpenMedia: (media: unknown, index: number, lang?: string) => void;
}>;

const messages = defineMessages({
  audioAttachment: {
    id: 'messages.audio_attachment',
    defaultMessage: 'Audio attachment',
  },
});

interface Props {
  status: Status;

  memberUrls: Set<string>;

  isMine: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showTimestamp: boolean;

  showSenderName: boolean;

  quotedId?: string;
  quoted?: Status;

  onReply: (statusId: string) => void;
  onNavigateToQuoted?: (statusId: string) => void;
}

export const MessageBubble: React.FC<Props> = ({
  status,
  memberUrls,
  isMine,
  isFirstInGroup,
  isLastInGroup,
  showTimestamp,
  showSenderName,
  quotedId,
  quoted,
  onReply,
  onNavigateToQuoted,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const accountId = status.get('account') as string | undefined;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const [expanded, setExpanded] = useState(false);
  const handleToggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  const spoilerHtml = status.get('spoilerHtml') as string | undefined;
  const hasWarning = Boolean((status.get('spoiler_text') as string | undefined)?.length);

  const language = status.get('language') as string | undefined;
  const statusId = status.get('id') as string;
  const isSensitive = Boolean(status.get('sensitive'));

  const allMedia = status.get('media_attachments') as
    | ImmutableList<ImmutableMap<string, unknown>>
    | undefined;

  const audioMedia = useMemo(
    () => allMedia?.filter((item) => item.get('type') === 'audio'),
    [allMedia],
  );

  const galleryMediaList = useMemo(
    () => allMedia?.filter((item) => item.get('type') !== 'audio'),
    [allMedia],
  );

  const hasGalleryMedia = Boolean(galleryMediaList && !galleryMediaList.isEmpty());
  const hasAudio = Boolean(audioMedia && !audioMedia.isEmpty());

  const handleOpenMedia = useCallback(
    (galleryMedia: unknown, index: number, lang?: string) => {
      dispatch(
        openModal({
          modalType: 'MEDIA',
          modalProps: { media: galleryMedia, index, lang },
        }),
      );
    },
    [dispatch],
  );

  const contentHtml = useMemo(() => {
    const html = status.get('contentHtml') as string | undefined;

    return html ? stripLeadingMentions(html, memberUrls) : html;
  }, [status, memberUrls]);

  const hasText = Boolean(contentHtml && contentHtml.trim() !== '');
  const showBody = !hasWarning || expanded;

  return (
    <div
      id={`dm-message-${status.get('id') as string}`}
      className={classNames('dm-message', {
        'dm-message--mine': isMine,
        'dm-message--theirs': !isMine,
        'dm-message--first': isFirstInGroup,
        'dm-message--last': isLastInGroup,
      })}
    >
      <span className='dm-message__sr-label'>
        {isMine ? (
          <FormattedMessage
            id='messages.sent_by_me'
            defaultMessage='Sent by you'
          />
        ) : (
          <FormattedMessage
            id='messages.sent_by_them'
            defaultMessage='Sent by {name}'
            values={{ name: account?.display_name ?? account?.username ?? '' }}
          />
        )}
      </span>

      {!isMine && (
        <div className='dm-message__avatar'>
          {isLastInGroup && account && <Avatar account={account} size={32} />}
        </div>
      )}

      <div className='dm-message__body'>
        {showSenderName && isFirstInGroup && !isMine && account && (
          <span className='dm-message__sender'>
            {account.display_name || account.username}
          </span>
        )}

        {quotedId && (
          <MessageQuote
            quotedId={quotedId}
            quoted={quoted}
            memberUrls={memberUrls}
            onNavigate={onNavigateToQuoted}
          />
        )}

        {hasWarning && (
          <ContentWarning
            text={spoilerHtml ?? ''}
            expanded={expanded}
            onClick={handleToggle}
          />
        )}

        {showBody && hasText && (
          <div className='dm-message__bubble'>
            <StatusContent status={status} statusContent={contentHtml} />
          </div>
        )}

        {showBody && hasGalleryMedia && (
          <div className='dm-message__media'>
            <MediaGallery
              media={galleryMediaList}
              sensitive={isSensitive}
              lang={language}
              onOpenMedia={handleOpenMedia}
            />
          </div>
        )}

        {showBody && hasAudio && (
          <div className='dm-message__audio'>
            {audioMedia?.map((item) => (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                key={item.get('id') as string}
                controls
                preload='none'
                src={item.get('url') as string}
                aria-label={
                  (item.get('description') as string | null) ??
                  intl.formatMessage(messages.audioAttachment)
                }
              />
            ))}
          </div>
        )}

        {showTimestamp && (
          <time
            className='dm-message__time'
            dateTime={status.get('created_at') as string}
          >
            <FormattedTime
              value={status.get('created_at') as string}
              hour='numeric'
              minute='2-digit'
            />
          </time>
        )}
      </div>

      <MessageMenu
        statusId={statusId}
        accountId={accountId}
        accountAcct={account?.acct}
        isMine={isMine}
        contentHtml={showBody ? contentHtml : undefined}
        onReply={onReply}
      />
    </div>
  );
};
