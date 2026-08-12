// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { useRouteMatch } from 'react-router-dom';

import SearchIcon from '@/images/search.svg?react';
import { fetchAdminDmRooms } from 'mastodon/actions/admin_dm_rooms';
import { Icon } from 'mastodon/components/icon';
import ScrollableList from 'mastodon/components/scrollable_list';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { RoomListItem } from '../components/room_list_item';
import { selectAdminDmRooms } from '../selectors';

const messages = defineMessages({
  title: { id: 'column.messages_all', defaultMessage: 'All messages' },
  search: { id: 'messages.search', defaultMessage: 'Search' },
});

const matches = (
  accounts: { display_name: string; username: string; acct: string }[],
  query: string,
) => {
  const needle = query.trim().toLowerCase();

  if (needle === '') return true;

  return accounts.some(
    (account) =>
      account.display_name.toLowerCase().includes(needle) ||
      account.username.toLowerCase().includes(needle) ||
      account.acct.toLowerCase().includes(needle),
  );
};

export const AdminRoomList: React.FC = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const match = useRouteMatch<{ roomId?: string }>('/messages/all/:roomId');
  const activeRoomId = match?.params.roomId;

  const [query, setQuery] = useState('');

  const order = useAppSelector((state) => selectAdminDmRooms(state).order);
  const rooms = useAppSelector((state) => selectAdminDmRooms(state).rooms);
  const next = useAppSelector((state) => selectAdminDmRooms(state).next);
  const isLoading = useAppSelector(
    (state) => selectAdminDmRooms(state).isLoading,
  );
  const loaded = useAppSelector((state) => selectAdminDmRooms(state).loaded);
  const hasError = useAppSelector(
    (state) => selectAdminDmRooms(state).hasError,
  );

  useEffect(() => {
    void dispatch(fetchAdminDmRooms());
  }, [dispatch]);

  const handleLoadMore = useCallback(() => {
    if (next) void dispatch(fetchAdminDmRooms({ url: next }));
  }, [dispatch, next]);

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [],
  );

  const visibleRooms = useMemo(() => {
    const resolved = order.flatMap((roomId) => {
      const room = rooms[roomId];

      return room ? [room] : [];
    });

    return query.trim() === ''
      ? resolved
      : resolved.filter((room) => matches(room.accounts, query));
  }, [order, query, rooms]);

  const isSearching = query.trim() !== '';

  return (
    <div className='dm-room-list'>
      <div className='dm-room-list__header'>
        <h1 className='dm-room-list__title'>
          {intl.formatMessage(messages.title)}
        </h1>
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
        scrollKey='admin-messages'
        trackScroll={false}
        bindToDocument={false}
        isLoading={isLoading}
        showLoading={isLoading && !loaded}
        hasMore={Boolean(next) && !isSearching}
        onLoadMore={handleLoadMore}
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
          ) : (
            <FormattedMessage
              id='messages.admin.empty'
              defaultMessage='There are no conversations on this server yet.'
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
            to={`/messages/all/${room.id}`}
          />
        ))}
      </ScrollableList>
    </div>
  );
};
