import { useCallback, useEffect, useRef } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import FolderCogIcon from '@/styles/bird-theme-svg/folder-cog.svg?react';
import { UNSORTED_FOLDER_ID } from 'mastodon/actions/bookmark_list';
import { openModal } from 'mastodon/actions/modal';
import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { IconButton } from 'mastodon/components/icon_button';
import { useAppDispatch } from 'mastodon/store';

const messages = defineMessages({
  label: {
    id: 'bookmark_folders.tabs_label',
    defaultMessage: 'Bookmark folders',
  },
  manage: { id: 'bookmark_folders.manage', defaultMessage: 'Manage folders' },
  folderTitle: {
    id: 'bookmark_folders.tab_title',
    defaultMessage: '{name} ({count, plural, one {# post} other {# posts}})',
  },
});

const Tab: React.FC<{
  id?: string;
  title?: string;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  children: React.ReactNode;
}> = ({ id, title, selected, onSelect, children }) => {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    }
  }, [selected]);

  return (
    <button
      ref={ref}
      type='button'
      aria-pressed={selected}
      title={title}
      className={classNames('bookmark-folder-tabs__tab', {
        'bookmark-folder-tabs__tab--active': selected,
      })}
      onClick={handleClick}
    >
      {children}
    </button>
  );
};

export const BookmarkFolderTabs: React.FC<{
  folders: ApiBookmarkFolderJSON[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}> = ({ folders, selectedId, onSelect }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const handleManage = useCallback(() => {
    dispatch(
      openModal({ modalType: 'BOOKMARK_FOLDER_MANAGER', modalProps: {} }),
    );
  }, [dispatch]);

  return (
    <div className='bookmark-folder-tabs'>
      <nav
        className='bookmark-folder-tabs__list'
        aria-label={intl.formatMessage(messages.label)}
      >
        <Tab selected={!selectedId} onSelect={onSelect}>
          <FormattedMessage id='bookmark_folders.all' defaultMessage='All' />
        </Tab>

        <Tab
          id={UNSORTED_FOLDER_ID}
          selected={selectedId === UNSORTED_FOLDER_ID}
          onSelect={onSelect}
        >
          <FormattedMessage
            id='bookmark_folders.unsorted'
            defaultMessage='Unsorted'
          />
        </Tab>

        {folders.map((folder) => (
          <Tab
            key={folder.id}
            id={folder.id}
            title={intl.formatMessage(messages.folderTitle, {
              name: folder.name,
              count: folder.statuses_count,
            })}
            selected={folder.id === selectedId}
            onSelect={onSelect}
          >
            <span className='bookmark-folder-tabs__name'>{folder.name}</span>{' '}
            <span className='bookmark-folder-tabs__count'>
              {folder.statuses_count}
            </span>
          </Tab>
        ))}
      </nav>

      <IconButton
        className='bookmark-folder-tabs__manage'
        icon='cog'
        iconComponent={FolderCogIcon}
        title={intl.formatMessage(messages.manage)}
        onClick={handleManage}
      />
    </div>
  );
};
