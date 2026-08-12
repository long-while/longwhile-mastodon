// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { useHistory, useRouteMatch } from 'react-router-dom';

import AddIcon from '@/images/message-plus.svg?react';
import SearchIcon from '@/images/search.svg?react';
import { fetchDmRooms, markDmRoomRead } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Icon } from 'mastodon/components/icon';
import ScrollableList from 'mastodon/components/scrollable_list';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectDmDrafts, selectDmRooms } from '../selectors';

import { RoomFilterMenu } from './room_filter_menu';
import type { RoomFilter } from './room_filter_menu';
import { RoomListItem } from './room_list_item';

const messages = defineMessages({
  title: { id: 'column.messages', defaultMessage: 'Messages' },
  compose: { id: 'messages.new.title', defaultMessage: 'New message' },
  search: { id: 'messages.search', defaultMessage: 'Search' },
});

const matchesQuery = (
  haystack: { display_name: string; username: string; acct: string }[],
  title: string,
  query: string,
) => {
  const needle = query.trim().toLowerCase();

  if (needle === '') return true;

  if (title.toLowerCase().includes(needle)) return true;

  return haystack.some(
    (account) =>
      account.display_name.toLowerCase().includes(needle) ||
      account.username.toLowerCase().includes(needle) ||
      account.acct.toLowerCase().includes(needle),
  );
};

export const RoomList: React.FC = () => {
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useAppDispatch();

  const match = useRouteMatch<{ roomId?: string }>('/messages/:roomId');
  const activeRoomId = match?.params.roomId;

  const [filter, setFilter] = useState<RoomFilter>('all');
  const [query, setQuery] = useState('');

  const order = useAppSelector((state) => selectDmRooms(state).order);
  const rooms = useAppSelector((state) => selectDmRooms(state).rooms);
  const next = useAppSelector((state) => selectDmRooms(state).next);
  const isLoading = useAppSelector((state) => selectDmRooms(state).isLoading);
  const loaded = useAppSelector((state) => selectDmRooms(state).loaded);
  const hasError = useAppSelector((state) => selectDmRooms(state).hasError);
  const drafts = useAppSelector(selectDmDrafts);

  useEffect(() => {
    void dispatch(fetchDmRooms({}));
  }, [dispatch]);

  const handleLoadMore = useCallback(() => {
    if (next) void dispatch(fetchDmRooms({ url: next }));
  }, [dispatch, next]);

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

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [],
  );

  const visibleRooms = useMemo(() => {
    let resolved = order.flatMap((roomId) => {
      const room = rooms[roomId];

      return room ? [room] : [];
    });

    if (filter === 'unread') {
      resolved = resolved.filter((room) => room.unread_count > 0);
    }

    if (query.trim() !== '') {
      resolved = resolved.filter((room) =>
        matchesQuery(
          room.accounts,
          room.title ??
            room.accounts
              .map((entry) => entry.display_name || entry.username)
              .join(', '),
          query,
        ),
      );
    }

    return resolved;
  }, [filter, order, query, rooms]);

  const unreadRoomIds = useMemo(
    () =>
      order.flatMap((roomId) => {
        const room = rooms[roomId];

        return room && room.unread_count > 0 ? [roomId] : [];
      }),
    [order, rooms],
  );

  const handleMarkAllRead = useCallback(() => {
    unreadRoomIds.forEach((roomId) => {
      void dispatch(markDmRoomRead({ roomId }));
    });
  }, [dispatch, unreadRoomIds]);

  const isSearching = query.trim() !== '';

  return (
    <div className='dm-room-list'>
      <div className='dm-room-list__header'>
        <h1 className='dm-room-list__title'>
          {intl.formatMessage(messages.title)}
        </h1>

        <RoomFilterMenu
          active={filter}
          hasUnread={unreadRoomIds.length > 0}
          onSelect={setFilter}
          onMarkAllRead={handleMarkAllRead}
        />

        <button
          type='button'
          className='dm-room-list__compose'
          title={intl.formatMessage(messages.compose)}
          aria-label={intl.formatMessage(messages.compose)}
          onClick={handleCompose}
        >
          <Icon id='message-plus' icon={AddIcon} />
        </button>
      </div>

      <div className='dm-room-list__search'>
        <Icon id='search' icon={SearchIcon} />

        <input
          type='search'
          value={query}
          placeholder={intl.formatMessage(messages.search)}
          aria-label={intl.formatMessage(messages.search)}
          onChange={handleQueryChange}
        />
      </div>

      <ScrollableList
        scrollKey='messages'
        trackScroll={false}
        bindToDocument={false}
        isLoading={isLoading}
        showLoading={isLoading && !loaded}
        hasMore={Boolean(next) && !isSearching}
        onLoadMore={handleLoadMore}
        prepend={
          visibleRooms.length === 0 && Boolean(next) && !isSearching ? (
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
          ) : isSearching ? (
            <FormattedMessage
              id='messages.search_no_results'
              defaultMessage='No conversation matches.'
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
            isActive={room.id === activeRoomId}
            draft={drafts[room.id]}
          />
        ))}
      </ScrollableList>
    </div>
  );
};
