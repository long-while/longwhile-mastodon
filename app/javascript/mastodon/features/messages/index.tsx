// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';
import { Redirect, useHistory } from 'react-router-dom';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
import MessagesIcon from '@/material-icons/400-24px/mail.svg?react';
import { fetchDmRooms } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Column } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { Icon } from 'mastodon/components/icon';
import { NotSignedInIndicator } from 'mastodon/components/not_signed_in_indicator';
import ScrollableList from 'mastodon/components/scrollable_list';
import { useIdentity } from 'mastodon/identity_context';
import { dmChatEnabled, me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { RoomFilterTabs } from './components/room_filter_tabs';
import type { RoomFilter } from './components/room_filter_tabs';
import { RoomListItem } from './components/room_list_item';
import { selectDmRooms } from './selectors';
import { confirmLeaveRoom } from './util/leave_room';

const messages = defineMessages({
  title: { id: 'column.messages', defaultMessage: 'Messages' },
  compose: { id: 'messages.new.title', defaultMessage: 'New message' },
});

const Messages: React.FC<{ multiColumn?: boolean }> = ({ multiColumn }) => {
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useAppDispatch();
  const { signedIn } = useIdentity();

  const [filter, setFilter] = useState<RoomFilter>('all');

  const order = useAppSelector((state) => selectDmRooms(state).order);
  const rooms = useAppSelector((state) => selectDmRooms(state).rooms);
  const next = useAppSelector((state) => selectDmRooms(state).next);
  const isLoading = useAppSelector((state) => selectDmRooms(state).isLoading);
  const loaded = useAppSelector((state) => selectDmRooms(state).loaded);
  const hasError = useAppSelector((state) => selectDmRooms(state).hasError);

  useEffect(() => {
    if (signedIn) void dispatch(fetchDmRooms());
  }, [dispatch, signedIn]);

  const handleLoadMore = useCallback(() => {
    if (next) void dispatch(fetchDmRooms({ url: next }));
  }, [dispatch, next]);

  const handleLeave = useCallback(
    (roomId: string) => {
      confirmLeaveRoom(dispatch, intl, roomId);
    },
    [dispatch, intl],
  );

  const handleCompose = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'DM_RECIPIENT',
        modalProps: {
          onCreated: (roomId: string) => {
            history.push(`/messages/${roomId}`);
          },
        },
      }),
    );
  }, [dispatch, history]);

  const visibleRooms = useMemo(() => {
    const resolved = order.flatMap((roomId) => {
      const room = rooms[roomId];

      return room ? [room] : [];
    });

    return filter === 'unread'
      ? resolved.filter((room) => room.unread_count > 0)
      : resolved;
  }, [filter, order, rooms]);

  if (!dmChatEnabled) return <Redirect to='/conversations' />;

  if (!signedIn) {
    return (
      <Column bindToDocument={!multiColumn} label={intl.formatMessage(messages.title)}>
        <ColumnHeader
          icon='messages'
          iconComponent={MessagesIcon}
          title={intl.formatMessage(messages.title)}
          multiColumn={multiColumn}
        />
        <NotSignedInIndicator />
      </Column>
    );
  }

  return (
    <Column bindToDocument={!multiColumn} label={intl.formatMessage(messages.title)}>
      <ColumnHeader
        icon='messages'
        iconComponent={MessagesIcon}
        title={intl.formatMessage(messages.title)}
        multiColumn={multiColumn}
        showBackButton
        extraButton={
          <button
            type='button'
            className='column-header__button'
            title={intl.formatMessage(messages.compose)}
            aria-label={intl.formatMessage(messages.compose)}
            onClick={handleCompose}
          >
            <Icon id='plus' icon={AddIcon} />
          </button>
        }
        appendContent={<RoomFilterTabs active={filter} onSelect={setFilter} />}
      />

      <ScrollableList
        scrollKey='messages'
        trackScroll={!multiColumn}
        bindToDocument={!multiColumn}
        isLoading={isLoading}
        showLoading={isLoading && !loaded}
        hasMore={Boolean(next)}
        onLoadMore={handleLoadMore}
        prepend={
          filter === 'unread' && visibleRooms.length === 0 && Boolean(next) ? (
            <div className='dm-room-list__notice'>
              <FormattedMessage
                id='messages.filter.none_on_page'
                defaultMessage='Nothing unread so far. Load more to keep looking.'
              />
            </div>
          ) : undefined
        }
        emptyMessage={
          hasError ? (
            <FormattedMessage
              id='messages.load_failed'
              defaultMessage='Could not load your conversations.'
            />
          ) : filter === 'unread' ? (
            <FormattedMessage
              id='empty_column.messages_unread'
              defaultMessage='Nothing unread.'
            />
          ) : (
            <FormattedMessage
              id='empty_column.messages'
              defaultMessage='You have no conversations yet. Send someone a message to start one.'
            />
          )
        }
      >
        {visibleRooms.map((room) => (
          <RoomListItem
            key={room.id}
            room={room}
            myAccountId={me ?? ''}
            onLeave={handleLeave}
          />
        ))}
      </ScrollableList>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default Messages;
