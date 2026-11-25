import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import ChevronDownIcon from '@/styles/bird-theme-svg/chevron-down.svg?react';
import UserCircleIcon from '@/styles/bird-theme-svg/user-circle.svg?react';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { apiGetBookmarkAuthors } from 'mastodon/api/bookmark_folders';
import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  allAuthors: {
    id: 'bookmarks.filter.all_authors',
    defaultMessage: 'All authors',
  },
  label: { id: 'bookmarks.filter.author', defaultMessage: 'Filter by author' },
});

interface AuthorItem {
  accountId?: string;
}

const AuthorLabel: React.FC<{ accountId?: string; avatarSize?: number }> = ({
  accountId,
  avatarSize = 20,
}) => {
  const intl = useIntl();
  const account = useAppSelector((state) =>
    accountId ? state.accounts.get(accountId) : undefined,
  );

  if (!account) {
    return (
      <span className='bookmark-author-filter__label'>
        <Icon id='bookmark-author' icon={UserCircleIcon} />
        <span className='bookmark-author-filter__name'>
          {intl.formatMessage(messages.allAuthors)}
        </span>
      </span>
    );
  }

  return (
    <span className='bookmark-author-filter__label'>
      <Avatar account={account} size={avatarSize} />
      <span className='bookmark-author-filter__name'>
        <DisplayName account={account} />
      </span>
    </span>
  );
};

const useBookmarkAuthors = () => {
  const dispatch = useAppDispatch();
  const [authorIds, setAuthorIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    apiGetBookmarkAuthors()
      .then((accounts) => {
        if (cancelled) return;
        dispatch(importFetchedAccounts(accounts));
        setAuthorIds(accounts.map((account) => account.id));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return authorIds;
};

export const AuthorFilter: React.FC<{
  accountId?: string;
  onChange: (accountId: string | undefined) => void;
}> = ({ accountId, onChange }) => {
  const intl = useIntl();
  const authorIds = useBookmarkAuthors();

  const items = useMemo<AuthorItem[]>(
    () => [{}, ...authorIds.map((id) => ({ accountId: id }))],
    [authorIds],
  );

  const handleItemClick = useCallback(
    (item: AuthorItem) => {
      onChange(item.accountId);
    },
    [onChange],
  );

  const renderItem = useCallback(
    (
      item: AuthorItem,
      index: number,
      handlers: {
        onClick: React.MouseEventHandler;
        onKeyUp: React.KeyboardEventHandler;
      },
    ) => (
      <li
        key={item.accountId ?? 'all'}
        className={classNames(
          'dropdown-menu__item',
          'bookmark-author-filter__option',
          {
            'bookmark-author-filter__option--active':
              item.accountId === accountId,
          },
        )}
      >
        <button
          type='button'
          data-index={index}
          aria-current={item.accountId === accountId ? 'true' : undefined}
          onClick={handlers.onClick}
          onKeyUp={handlers.onKeyUp}
        >
          <AuthorLabel accountId={item.accountId} avatarSize={24} />
        </button>
      </li>
    ),
    [accountId],
  );

  return (
    <Dropdown<AuthorItem>
      items={items}
      renderItem={renderItem}
      onItemClick={handleItemClick}
      scrollable
      forceDropdown
      title={intl.formatMessage(messages.label)}
    >
      <button
        type='button'
        className={classNames('bookmark-filter-bar__chip', {
          'bookmark-filter-bar__chip--active': !!accountId,
        })}
        aria-haspopup='true'
        title={intl.formatMessage(messages.label)}
      >
        <AuthorLabel accountId={accountId} />
        <Icon id='bookmark-author-caret' icon={ChevronDownIcon} />
      </button>
    </Dropdown>
  );
};
