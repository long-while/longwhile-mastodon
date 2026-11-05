// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   왼쪽 대화 목록 패널.
//
//   **이 컴포넌트는 방을 옮길 때 언마운트되면 안 된다.** 그래서 /messages 라우트가
//   이것을 들고 있고 방만 자식 Route 로 갈아 끼운다(index.tsx). 목록이 다시
//   마운트되면 매번 다시 불러오고 스크롤이 맨 위로 튄다.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { useHistory, useRouteMatch } from 'react-router-dom';

import AddIcon from '@/images/message-plus.svg?react';
import SearchIcon from '@/images/search.svg?react';
import { fetchDmRooms, markDmRoomRead } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Icon } from 'mastodon/components/icon';
import ScrollableList from 'mastodon/components/scrollable_list';
import { MobileMenuAvatarButton } from 'mastodon/features/ui/components/mobile_menu_avatar_button';
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

// 검색은 **이미 받아온 방 안에서만** 거른다. 서버에 방 검색이 없고, 만들더라도
// 페이지네이션 커서(last_status_id 기준)와 섞이면 "다음 페이지가 비었는데 더
// 있다고 하는" 상태가 생긴다. 뒤 페이지의 방은 그 페이지를 받아야 찾힌다.
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

  // 지금 열려 있는 방. 목록에서 그 항목을 강조하는 데만 쓴다.
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

  // order 에는 있는데 rooms 에 없는 id 가 섞일 수 있다(나가기 직후 등).
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

  // 받아온 페이지 안의 안 읽은 방을 전부 읽음으로 민다. 전용 엔드포인트가 없어
  // 방마다 한 번씩 부른다 — 목록 한 페이지가 20개라 그만큼이 상한이다.
  // 뒤 페이지까지 한 번에 처리하지는 않는다. 화면에 없는 것을 읽음으로 바꾸는
  // 것은 사용자가 시킨 적 없는 일이다.
  const handleMarkAllRead = useCallback(() => {
    unreadRoomIds.forEach((roomId) => {
      void dispatch(markDmRoomRead({ roomId }));
    });
  }, [dispatch, unreadRoomIds]);

  const isSearching = query.trim() !== '';

  return (
    <div className='dm-room-list'>
      <div className='dm-room-list__header'>
        {/* 칼럼 헤더가 아니라 따로 그린 헤더라, 서랍을 여는 사진도 따로 넣는다. */}
        <MobileMenuAvatarButton />

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

      {/* 우측 작성창 패널을 감추면서 그 안의 검색이 함께 사라진다. 여기로 옮긴다. */}
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
        // 패널이 자기 스크롤을 갖는다. 문서 스크롤에 묶으면 3열 레이아웃에서
        // 목록과 대화방이 함께 움직인다.
        trackScroll={false}
        bindToDocument={false}
        isLoading={isLoading}
        showLoading={isLoading && !loaded}
        hasMore={Boolean(next) && !isSearching}
        onLoadMore={handleLoadMore}
        // 걸러낸 결과가 비었는데 뒤 페이지가 남아 있으면 ScrollableList 는
        // emptyMessage 를 그리지 않아 "더 보기" 버튼만 남는다. 그 자리를 채운다.
        //
        // children 이 아니라 prepend 로 넘긴다. children 에 falsy 를 섞으면
        // ScrollableList 가 Children.map 안에서 child.key 를 읽다 터진다.
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
            // 쓰다 만 글이 있는 방은 마지막 메시지 대신 그것을 보여준다.
            // 어느 방에 답을 쓰다 말았는지 목록에서 바로 보여야 한다. (§4)
            draft={drafts[room.id]}
          />
        ))}
      </ScrollableList>
    </div>
  );
};
