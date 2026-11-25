import { useMemo } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import type { ApiBookmarkFolderJSON } from 'mastodon/api_types/bookmark_folders';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import type { MenuItem } from 'mastodon/models/dropdown_menu';

const messages = defineMessages({
  addToFolder: {
    id: 'bookmarks.select.add_to_folder',
    defaultMessage: 'Add to folder',
  },
  toolbar: {
    id: 'bookmarks.select.toolbar',
    defaultMessage: 'Actions for selected bookmarks',
  },
  noFolders: {
    id: 'bookmarks.select.no_folders',
    defaultMessage: 'Create a folder first.',
  },
});

const FolderPicker: React.FC<{
  folders: ApiBookmarkFolderJSON[];
  disabled: boolean;
  onPick: (folderId: string) => void;
}> = ({ folders, disabled, onPick }) => {
  const intl = useIntl();
  const items = useMemo<MenuItem[]>(
    () =>
      folders.map((folder) => ({
        text: folder.name,
        action: () => {
          onPick(folder.id);
        },
      })),
    [folders, onPick],
  );
  const empty = folders.length === 0;

  return (
    <Dropdown items={items} title={intl.formatMessage(messages.addToFolder)}>
      <button
        type='button'
        className='bookmark-select-actions__button'
        disabled={disabled || empty}
        aria-haspopup='true'
        title={empty ? intl.formatMessage(messages.noFolders) : undefined}
      >
        {intl.formatMessage(messages.addToFolder)}
      </button>
    </Dropdown>
  );
};

export const BookmarkSelectActions: React.FC<{
  selectedCount: number;
  loadedCount: number;
  folders: ApiBookmarkFolderJSON[];
  currentFolderId?: string;
  busy: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAddToFolder: (folderId: string) => void;
  onRemoveFromFolder: () => void;
  onUnbookmark: () => void;
  onDone: () => void;
}> = ({
  selectedCount,
  loadedCount,
  folders,
  currentFolderId,
  busy,
  onSelectAll,
  onClearSelection,
  onAddToFolder,
  onRemoveFromFolder,
  onUnbookmark,
  onDone,
}) => {
  const intl = useIntl();
  const nothing = selectedCount === 0;
  const allSelected = loadedCount > 0 && selectedCount >= loadedCount;
  const targets = useMemo(
    () => folders.filter((folder) => folder.id !== currentFolderId),
    [folders, currentFolderId],
  );

  return (
    <div
      className='bookmark-select-actions'
      role='toolbar'
      aria-label={intl.formatMessage(messages.toolbar)}
    >
      <span className='bookmark-select-actions__count' role='status'>
        <FormattedMessage
          id='bookmarks.select.count'
          defaultMessage='{count} selected'
          values={{ count: selectedCount }}
        />
      </span>

      <button
        type='button'
        className='bookmark-select-actions__button'
        onClick={allSelected ? onClearSelection : onSelectAll}
        disabled={busy || loadedCount === 0}
      >
        {allSelected ? (
          <FormattedMessage
            id='bookmarks.select.clear'
            defaultMessage='Deselect all'
          />
        ) : (
          <FormattedMessage
            id='bookmarks.select.all'
            defaultMessage='Select all'
          />
        )}
      </button>

      <FolderPicker
        folders={targets}
        disabled={busy || nothing}
        onPick={onAddToFolder}
      />

      {currentFolderId && (
        <button
          type='button'
          className='bookmark-select-actions__button'
          onClick={onRemoveFromFolder}
          disabled={busy || nothing}
        >
          <FormattedMessage
            id='bookmark_folders.remove_from_folder'
            defaultMessage='Remove from this folder'
          />
        </button>
      )}

      <button
        type='button'
        className='bookmark-select-actions__button bookmark-select-actions__button--dangerous'
        onClick={onUnbookmark}
        disabled={busy || nothing}
      >
        <FormattedMessage
          id='bookmarks.select.unbookmark'
          defaultMessage='Remove bookmarks'
        />
      </button>

      <button
        type='button'
        className='bookmark-select-actions__button bookmark-select-actions__done'
        onClick={onDone}
      >
        <FormattedMessage id='bookmarks.select.done' defaultMessage='Done' />
      </button>
    </div>
  );
};
