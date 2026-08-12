// @_longwhile custom feature

import { Fragment, useEffect, useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { Link, useParams } from 'react-router-dom';

import {
  fetchAdminDmRoom,
  fetchAdminDmRoomStatuses,
} from 'mastodon/actions/admin_dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import type { Status } from 'mastodon/models/status';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { DateDivider } from '../components/date_divider';
import { MessageBubble } from '../components/message_bubble';
import {
  selectAdminDmRoom,
  selectAdminDmRoomMessages,
  selectMessageAccount,
  selectMessageStatuses,
} from '../selectors';
import type { GroupableMessage } from '../util/group_messages';
import { groupMessages } from '../util/group_messages';

const messages = defineMessages({
  title: { id: 'column.messages_all', defaultMessage: 'All messages' },
  readOnly: {
    id: 'messages.admin.read_only',
    defaultMessage: 'Moderation view. You cannot reply here.',
  },
  loadFailed: {
    id: 'messages.room.load_failed',
    defaultMessage: 'Could not load this conversation.',
  },
});

interface AdminMessage extends GroupableMessage {
  status: Status;
}

export const AdminRoom: React.FC = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { roomId } = useParams<{ roomId?: string }>();

  const room = useAppSelector((state) => selectAdminDmRoom(state, roomId));
  const messageState = useAppSelector((state) =>
    selectAdminDmRoomMessages(state, roomId),
  );
  const statusesById = useAppSelector(selectMessageStatuses);

  useEffect(() => {
    if (!roomId) return;

    void dispatch(fetchAdminDmRoom({ roomId }));
    void dispatch(fetchAdminDmRoomStatuses({ roomId }));
  }, [dispatch, roomId]);

  const leftAccountId = room?.accounts[0]?.id;

  const memberUrls = useMemo(
    () =>
      new Set(
        (room?.accounts ?? [])
          .map((account) => account.url)
          .filter((url): url is string => Boolean(url)),
      ),
    [room?.accounts],
  );

  const sections = useMemo(() => {
    const ids = messageState?.statusIds ?? [];

    const entries = ids
      .map((id: string) => statusesById.get(id))
      .filter((status): status is Status => Boolean(status))
      .map((status) => ({
        id: status.get('id') as string,
        accountId: status.get('account') as string,
        createdAt: status.get('created_at') as string,
        quotesAnotherMessage: false,
        status,
      }));

    return groupMessages<AdminMessage>(entries);
  }, [messageState?.statusIds, statusesById]);

  const otherAccount = useAppSelector((state) =>
    selectMessageAccount(state, leftAccountId),
  );

  if (!roomId) return null;

  const isLoading = !messageState || messageState.isLoading;
  const title = room?.accounts
    .map((entry) => entry.display_name || entry.username)
    .join(' ↔ ');

  return (
    <div
      className='dm-room dm-room--readonly'
      role='region'
      aria-label={intl.formatMessage(messages.title)}
    >
      <div className='dm-room-header'>
        <Link className='dm-room-header__back' to='/messages/all'>
          <span className='dm-room-header__back__label'>
            {intl.formatMessage(messages.title)}
          </span>
        </Link>

        <div className='dm-room-header__identity'>
          {otherAccount && <Avatar account={otherAccount} size={40} />}

          <div className='dm-room-header__names'>
            <span className='dm-room-header__title'>{title}</span>
            <span className='dm-room-header__subtitle'>
              {intl.formatMessage(messages.readOnly)}
            </span>
          </div>
        </div>
      </div>

      <div className='dm-room__scroll'>
        {isLoading && sections.length === 0 && <LoadingIndicator />}

        {messageState?.hasError && (
          <p className='dm-room__empty'>
            {intl.formatMessage(messages.loadFailed)}
          </p>
        )}

        {sections.map((section) => (
          <div key={section.key}>
            <DateDivider date={section.date} />

            {section.groups.map((group) => (
              <div key={group.key} className='dm-room__group'>
                {group.messages.map((entry) => (
                  <Fragment key={entry.message.id}>
                    <MessageBubble
                      status={entry.message.status}
                      memberUrls={memberUrls}
                      isMine={entry.message.accountId !== leftAccountId}
                      isFirstInGroup={entry.isFirstInGroup}
                      isLastInGroup={entry.isLastInGroup}
                      isSenderChanged={entry.isSenderChanged}
                      showTimestamp={entry.showTimestamp}
                      showSenderName
                      readOnly
                    />
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
