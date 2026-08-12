// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import ArrowBackIcon from '@/material-icons/400-24px/arrow_back.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { setDmRoomTitle } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from '../selectors';

import { RoomAvatar } from './room_avatar';

const messages = defineMessages({
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
  leave: { id: 'messages.leave', defaultMessage: 'Leave conversation' },
  more: { id: 'status.more', defaultMessage: 'More' },
  viewProfile: {
    id: 'messages.intro.view_profile',
    defaultMessage: 'View profile',
  },
  editTitle: {
    id: 'messages.title.edit',
    defaultMessage: 'Change conversation title',
  },
  members: {
    id: 'messages.members.manage',
    defaultMessage: 'Manage members',
  },
  titlePlaceholder: {
    id: 'messages.title.placeholder',
    defaultMessage: 'Conversation title',
  },
});

interface Props {
  room?: ApiDmRoomJSON;
  onLeave: () => void;
}

export const RoomHeader: React.FC<Props> = ({ room, onLeave }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const otherId = room?.accounts[0]?.id;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, otherId),
  );

  const memberIds = useMemo(
    () => room?.accounts.map((entry) => entry.id) ?? [],
    [room?.accounts],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const roomId = room?.id;

  useEffect(() => {
    setEditing(false);
  }, [roomId]);

  useEffect(() => {
    if (editing) titleInput.current?.focus();
  }, [editing]);

  const handleOpenMembers = useCallback(() => {
    if (!roomId) return;

    dispatch(
      openModal({ modalType: 'DM_MEMBERS', modalProps: { roomId } }),
    );
  }, [dispatch, roomId]);

  const handleStartEdit = useCallback(() => {
    setDraft(room?.title ?? '');
    committedRef.current = false;
    setEditing(true);
  }, [room?.title]);

  const committedRef = useRef(false);

  const handleCommit = useCallback(() => {
    if (committedRef.current) return;

    committedRef.current = true;
    setEditing(false);

    if (!roomId) return;

    const next = draft.trim();

    if (next === (room?.title ?? '')) return;

    void dispatch(setDmRoomTitle({ roomId, title: next }));
  }, [dispatch, draft, room?.title, roomId]);

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        handleCommit();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        committedRef.current = true;
        setEditing(false);
      }
    },
    [handleCommit],
  );

  const handleDraftChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.target.value);
    },
    [],
  );

  const handleLeave = useCallback(() => {
    onLeave();
  }, [onLeave]);

  const title =
    room?.title ??
    room?.accounts.map((entry) => entry.display_name || entry.username).join(', ');

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (account && !room?.is_group) {
      menu.push({
        text: intl.formatMessage(messages.viewProfile),
        to: `/@${account.acct}`,
      });
      menu.push(null);
    }

    if (roomId && room.is_group) {
      menu.push({
        text: intl.formatMessage(messages.members),
        action: handleOpenMembers,
      });
      menu.push(null);
    }

    if (room?.is_group || room?.title) {
      menu.push({
        text: intl.formatMessage(messages.editTitle),
        action: handleStartEdit,
      });
      menu.push(null);
    }

    menu.push({
      text: intl.formatMessage(messages.leave),
      action: handleLeave,
      dangerous: true,
    });

    return menu;
  }, [
    account,
    handleLeave,
    handleOpenMembers,
    handleStartEdit,
    intl,
    room?.is_group,
    room?.title,
    roomId,
  ]);

  return (
    <div className='dm-room-header'>
      <Link
        className='dm-room-header__back'
        to='/messages'
        aria-label={intl.formatMessage(messages.back)}
        title={intl.formatMessage(messages.back)}
      >
        <Icon id='chevron-left' icon={ArrowBackIcon} />
      </Link>

      <div className='dm-room-header__identity'>
        <RoomAvatar accountIds={memberIds} size={40} />

        <div className='dm-room-header__names'>
          {editing ? (
            <input
              ref={titleInput}
              type='text'
              className='dm-room-header__title-input'
              value={draft}
              maxLength={100}
              placeholder={intl.formatMessage(messages.titlePlaceholder)}
              aria-label={intl.formatMessage(messages.editTitle)}
              onChange={handleDraftChange}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleCommit}
            />
          ) : account && !room?.is_group ? (
            <Link to={`/@${account.acct}`} className='dm-room-header__title'>
              {title}
            </Link>
          ) : (
            <span className='dm-room-header__title'>{title}</span>
          )}

          {room?.is_group && (
            <span className='dm-room-header__subtitle'>
              <FormattedMessage
                id='messages.member_count'
                defaultMessage='{count} people'
                values={{ count: room.accounts.length + 1 }}
              />
            </span>
          )}
        </div>
      </div>

      <Dropdown
        items={items}
        icon='ellipsis-h'
        iconComponent={MoreHorizIcon}
        title={intl.formatMessage(messages.more)}
      />
    </div>
  );
};
