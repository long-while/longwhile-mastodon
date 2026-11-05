// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
//   운영진 화면의 방 목록. 인스턴스의 모든 방이다.
//
//   일반 목록(components/room_list.tsx)을 그대로 쓰지 않는 이유가 둘이다.
//   데이터가 다른 저장소에 있고(adminDmRooms), 나가기·새 대화·읽지 않음 필터처럼
//   참여자에게만 뜻이 있는 조작이 여기서는 전부 무의미하다.

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

// 검색은 받아온 방 안에서만 거른다. 서버에 방 검색이 없다 — 이유는 일반 목록의
// 같은 자리 주석 참조(페이지네이션 커서와 섞이면 hasMore 가 거짓말을 한다).
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
          // 카드에는 나가기 버튼이 없다(RoomListItem 에서 걷어냈다). 운영진은
          // 참여자가 아니라 애초에 나갈 방도 없다.
          //
          // myAccountId 를 빈 값으로 둔다. 미리보기의 "나: " 접두어는 보는 사람이
          // 참여자일 때만 뜻이 있는데, 여기서는 아니다.
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
