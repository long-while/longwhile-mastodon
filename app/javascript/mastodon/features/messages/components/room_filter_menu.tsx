// @_longwhile custom feature

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
