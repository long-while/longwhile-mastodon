// @_longwhile custom feature

import { useCallback, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, FormattedTime, useIntl } from 'react-intl';

import classNames from 'classnames';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import { openModal } from 'mastodon/actions/modal';
import { ContentWarning } from 'mastodon/components/content_warning';
import MediaGalleryRaw from 'mastodon/components/media_gallery';
import StatusContentRaw from 'mastodon/components/status_content';
import type { Status } from 'mastodon/models/status';
import { useAppDispatch, useAppSelector } from 'mastodon/store';
import { stripLeadingMentions } from 'mastodon/utils/strip_leading_mentions';

import { selectMessageAccount } from '../selectors';

import { MessageMenu } from './message_menu';

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
  read: { id: 'messages.read', defaultMessage: 'Read' },

  readBy: { id: 'messages.read_by', defaultMessage: 'Read {count}' },
});

interface Props {
  status: Status;

  memberUrls: Set<string>;

  isMine: boolean;

  isRead?: boolean;

  readByCount?: number;

  isFirstInGroup: boolean;

  isLastInGroup: boolean;

  isSenderChanged: boolean;

  showTimestamp: boolean;

  showSenderName: boolean;

  readOnly?: boolean;
}

export const MessageBubble: React.FC<Props> = ({
  status,
  memberUrls,
  isMine,
  isRead = false,
  readByCount = 0,
  isFirstInGroup,
  isLastInGroup,
  isSenderChanged,
  showTimestamp,
  showSenderName,
  readOnly = false,
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

  const createdAt = status.get('created_at') as string;
  const fullTime = intl.formatDate(createdAt, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const showRead = isMine && !readOnly && isRead;

  return (
    <div
      id={`dm-message-${status.get('id') as string}`}
      className={classNames('dm-message', {
        'dm-message--mine': isMine,
        'dm-message--theirs': !isMine,
        'dm-message--first': isFirstInGroup,
        'dm-message--last': isLastInGroup,
        'dm-message--sender-changed': isSenderChanged,
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

      <div className='dm-message__body' title={fullTime}>
        {showSenderName && isFirstInGroup && (readOnly || !isMine) && account && (
          <span className='dm-message__sender'>
            {account.display_name || account.username}
          </span>
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
            <div className='dm-message__bubble__text'>
              <StatusContent status={status} statusContent={contentHtml} />
            </div>
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

      </div>

      <div className='dm-message__aside'>
      {(showTimestamp || showRead) && (
        <div className='dm-message__meta'>
          {showRead && (
            <span className='dm-message__read'>
              {readByCount > 1
                ? intl.formatMessage(messages.readBy, { count: readByCount })
                : intl.formatMessage(messages.read)}
            </span>
          )}

          {showTimestamp && (
            <time className='dm-message__time' dateTime={createdAt} title={fullTime}>
              <FormattedTime
                value={createdAt}
                hour='2-digit'
                minute='2-digit'
                hour12={false}
              />
            </time>
          )}
        </div>
      )}

        {!readOnly && (
          <MessageMenu
            statusId={statusId}
            isMine={isMine}
            contentHtml={contentHtml}
          />
        )}
      </div>
    </div>
  );
};
