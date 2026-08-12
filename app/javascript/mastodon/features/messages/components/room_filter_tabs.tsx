// @_longwhile custom feature

import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import classNames from 'classnames';

export type RoomFilter = 'all' | 'unread';

const TabButton: React.FC<{
  filter: RoomFilter;
  active: RoomFilter;
  onSelect: (filter: RoomFilter) => void;
  children: React.ReactNode;
}> = ({ filter, active, onSelect, children }) => {
  const handleClick = useCallback(() => {
    onSelect(filter);
  }, [filter, onSelect]);

  return (
    <button
      type='button'
      className={classNames({ active: active === filter })}
      aria-pressed={active === filter}
      onClick={handleClick}
    >
      {children}
    </button>
  );
};

export const RoomFilterTabs: React.FC<{
  active: RoomFilter;
  onSelect: (filter: RoomFilter) => void;
}> = ({ active, onSelect }) => (
  <div className='dm-room-list__filter-bar'>
    <TabButton filter='all' active={active} onSelect={onSelect}>
      <FormattedMessage id='messages.filter.all' defaultMessage='All' />
    </TabButton>

    <TabButton filter='unread' active={active} onSelect={onSelect}>
      <FormattedMessage id='messages.filter.unread' defaultMessage='Unread' />
    </TabButton>
  </div>
);
