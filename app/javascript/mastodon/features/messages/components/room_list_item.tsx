// @_longwhile custom feature

import { useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Link } from 'react-router-dom';

import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';

import { previewText } from '../util/preview_text';
import { relativeTimeLabel } from '../util/relative_time';

import { RoomAvatar } from './room_avatar';

const messages = defineMessages({
  photo: { id: 'messages.preview.photo', defaultMessage: 'Photo' },
  video: { id: 'messages.preview.video', defaultMessage: 'Video' },
  audio: { id: 'messages.preview.audio', defaultMessage: 'Audio' },
  file: { id: 'messages.preview.file', defaultMessage: 'Attachment' },
  empty: { id: 'messages.preview.empty', defaultMessage: 'No messages yet' },
  contentWarning: {
    id: 'messages.preview.content_warning',
    defaultMessage: 'Content warning: {warning}',
  },
  fromMe: { id: 'messages.preview.from_me', defaultMessage: 'You: {body}' },
  draft: { id: 'messages.preview.draft', defaultMessage: 'Draft: {body}' },
});

interface Props {
  room: ApiDmRoomJSON;
  myAccountId: string;
  isActive?: boolean;
  draft?: string;

  to?: string;
}

export const RoomListItem: React.FC<Props> = ({
  room,
  myAccountId,
  isActive = false,
  draft,
  to,
}) => {
  const intl = useIntl();

  const memberIds = useMemo(
    () => room.accounts.map((entry) => entry.id),
    [room.accounts],
  );

  const title =
    room.title ??
    room.accounts
        .map((entry) => entry.display_name || entry.username)
        .join(', ');

  const last = room.last_status;

  const preview = previewText(
    last
      ? {
          content: last.content ?? '',
          spoilerText: last.spoiler_text ?? '',
          mediaTypes: last.media_attachments.map((media) => media.type),
          isMine: last.account.id === myAccountId,
        }
      : null,
    {
      photo: intl.formatMessage(messages.photo),
      video: intl.formatMessage(messages.video),
      audio: intl.formatMessage(messages.audio),
      file: intl.formatMessage(messages.file),
      empty: intl.formatMessage(messages.empty),
      contentWarning: (warning) =>
        intl.formatMessage(messages.contentWarning, { warning }),
      fromMe: (body) => intl.formatMessage(messages.fromMe, { body }),
      draft: (body) => intl.formatMessage(messages.draft, { body }),
    },
    draft,
  );

  const unread = room.unread_count > 0;

  return (
    <Link
      to={to ?? `/messages/${room.id}`}
      className={classNames('dm-room-item', {
        'dm-room-item--active': isActive,
        'dm-room-item--unread': unread,

        'dm-room-item--draft': Boolean(draft?.trim()),
      })}
    >
      <div className='dm-room-item__avatar'>
        <RoomAvatar accountIds={memberIds} size={48} />
      </div>

      <div className='dm-room-item__body'>
        <div className='dm-room-item__line'>
          <span className='dm-room-item__title'>{title}</span>
          <span className='dm-room-item__time'>
            {last ? relativeTimeLabel(intl, last.created_at) : ''}
          </span>
        </div>

        <div className='dm-room-item__line'>
          <span className='dm-room-item__preview'>{preview}</span>
          {unread && (
            <span className='dm-room-item__badge'>{room.unread_count}</span>
          )}
        </div>
      </div>
    </Link>
  );
};
