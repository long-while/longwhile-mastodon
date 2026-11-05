// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   목록의 필터와 일괄 동작.
//
//   상단 탭이 아니라 헤더의 드롭다운으로 둔다. 탭으로 늘어놓으면 목록 위에 한 줄이
//   상시로 붙어 방 하나가 덜 보이는데, 필터를 바꾸는 일은 드물다. 같은 메뉴에
//   "모두 읽음으로 표시" 같은 일괄 동작도 함께 담을 수 있다.
//
//   Dropdown 을 그대로 쓴다. 키보드 이동·바깥 클릭 닫기·모바일 액션 시트 전환이
//   전부 붙어 있다.

import { useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import ExpandMoreIcon from '@/material-icons/400-24px/expand_more.svg?react';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import type { MenuItem } from 'mastodon/models/dropdown_menu';

export type RoomFilter = 'all' | 'unread';

const messages = defineMessages({
  all: { id: 'messages.filter.all', defaultMessage: 'All' },
  unread: { id: 'messages.filter.unread', defaultMessage: 'Unread' },
  markAllRead: {
    id: 'messages.mark_all_read',
    defaultMessage: 'Mark all as read',
  },
  filter: { id: 'messages.filter.label', defaultMessage: 'Filter' },
});

export const RoomFilterMenu: React.FC<{
  active: RoomFilter;
  hasUnread: boolean;
  onSelect: (filter: RoomFilter) => void;
  onMarkAllRead: () => void;
}> = ({ active, hasUnread, onSelect, onMarkAllRead }) => {
  const intl = useIntl();

  const items = useMemo(() => {
    const menu: MenuItem[] = [
      {
        text: intl.formatMessage(messages.all),
        action: () => {
          onSelect('all');
        },
      },
      {
        text: intl.formatMessage(messages.unread),
        action: () => {
          onSelect('unread');
        },
      },
    ];

    // 안 읽은 것이 없으면 넣지 않는다. 눌러도 아무 일이 없는 항목을 두면
    // 눌러 놓고 안 됐다고 생각한다.
    if (hasUnread) {
      menu.push(null, {
        text: intl.formatMessage(messages.markAllRead),
        action: onMarkAllRead,
      });
    }

    return menu;
  }, [hasUnread, intl, onMarkAllRead, onSelect]);

  const label = intl.formatMessage(
    active === 'unread' ? messages.unread : messages.all,
  );

  return (
    <Dropdown items={items} title={intl.formatMessage(messages.filter)}>
      <button type='button' className='dm-room-list__filter'>
        <span>{label}</span>
        <Icon id='chevron-down' icon={ExpandMoreIcon} />
      </button>
    </Dropdown>
  );
};
