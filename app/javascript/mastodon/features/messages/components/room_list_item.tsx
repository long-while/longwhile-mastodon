// @_longwhile custom feature

import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Link } from 'react-router-dom';

import GroupIcon from '@/material-icons/400-24px/group.svg?react';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { Icon } from 'mastodon/components/icon';
import { useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from '../selectors';
import { fallbackPathFor, opensInChat } from '../util/group_fallback';
import { previewText } from '../util/preview_text';
import { relativeTimeLabel } from '../util/relative_time';

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
  group: { id: 'messages.group_conversation', defaultMessage: 'Group conversation' },
  leave: { id: 'messages.leave', defaultMessage: 'Leave conversation' },
});

interface Props {
  room: ApiDmRoomJSON;
  myAccountId: string;
  isActive?: boolean;
  draft?: string;
  onLeave?: (roomId: string) => void;
}

export const RoomListItem: React.FC<Props> = ({
  room,
  myAccountId,
  isActive = false,
  draft,
  onLeave,
}) => {
  const intl = useIntl();

  const handleLeave = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onLeave?.(room.id);
    },
    [onLeave, room.id],
  );

  const otherId = room.accounts[0]?.id;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, otherId),
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
      to={fallbackPathFor(room)}
      className={classNames('dm-room-item', {
        'dm-room-item--active': isActive,
        'dm-room-item--unread': unread,
      })}
    >
      <div className='dm-room-item__avatar'>
        {account && <Avatar account={account} size={48} />}
        {!opensInChat(room) && (
          <Icon
            id='group'
            icon={GroupIcon}
            className='dm-room-item__group-badge'
            title={intl.formatMessage(messages.group)}
          />
        )}
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

      {onLeave && (
        <button
          type='button'
          className='dm-room-item__leave'
          onClick={handleLeave}
          title={intl.formatMessage(messages.leave)}
          aria-label={intl.formatMessage(messages.leave)}
        >
          ×
        </button>
      )}
    </Link>
  );
};
