import { useCallback } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import PhotoLibraryIcon from '@/material-icons/400-24px/photo_library.svg?react';
import SearchIcon from '@/material-icons/400-24px/search.svg?react';
import { Icon } from 'mastodon/components/icon';

import { AuthorFilter } from './author_filter';

const messages = defineMessages({
  search: { id: 'bookmarks.search.label', defaultMessage: 'Search bookmarks' },
  placeholder: {
    id: 'bookmarks.search.placeholder',
    defaultMessage: 'Search text and notes',
  },
  clear: { id: 'bookmarks.search.clear', defaultMessage: 'Clear search' },
});

const SearchBox: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}> = ({ value, onChange, onSubmit, onClear }) => {
  const intl = useIntl();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && value) {
        e.preventDefault();
        e.stopPropagation();
        onClear();
      }
    },
    [value, onClear],
  );

  return (
    <form role='search' className='bookmark-search' onSubmit={handleSubmit}>
      <Icon
        id='bookmark-search'
        icon={SearchIcon}
        className='bookmark-search__icon'
      />
      <input
        type='text'
        className='bookmark-search__input'
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={intl.formatMessage(messages.placeholder)}
        aria-label={intl.formatMessage(messages.search)}
        enterKeyHint='search'
      />
      {value && (
        <button
          type='button'
          className='bookmark-search__clear'
          onClick={onClear}
          title={intl.formatMessage(messages.clear)}
          aria-label={intl.formatMessage(messages.clear)}
        >
          <Icon id='bookmark-search-clear' icon={CloseIcon} />
        </button>
      )}
    </form>
  );
};

export const BookmarkFilterBar: React.FC<{
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
  onlyMedia: boolean;
  onOnlyMediaChange: (onlyMedia: boolean) => void;
  accountId?: string;
  onAccountChange: (accountId: string | undefined) => void;
  filtered: boolean;
  onClearAll: () => void;
  selecting: boolean;
  onSelectingChange: (selecting: boolean) => void;
}> = ({
  searchText,
  onSearchTextChange,
  onSearchSubmit,
  onSearchClear,
  onlyMedia,
  onOnlyMediaChange,
  accountId,
  onAccountChange,
  filtered,
  onClearAll,
  selecting,
  onSelectingChange,
}) => {
  const handleMediaClick = useCallback(() => {
    onOnlyMediaChange(!onlyMedia);
  }, [onlyMedia, onOnlyMediaChange]);

  const handleSelectClick = useCallback(() => {
    onSelectingChange(!selecting);
  }, [selecting, onSelectingChange]);

  return (
    <div className='bookmark-filter-bar'>
      <SearchBox
        value={searchText}
        onChange={onSearchTextChange}
        onSubmit={onSearchSubmit}
        onClear={onSearchClear}
      />

      <div className='bookmark-filter-bar__chips'>
        <button
          type='button'
          className={classNames('bookmark-filter-bar__chip', {
            'bookmark-filter-bar__chip--active': onlyMedia,
          })}
          aria-pressed={onlyMedia}
          onClick={handleMediaClick}
        >
          <Icon id='bookmark-media' icon={PhotoLibraryIcon} />
          <FormattedMessage
            id='bookmarks.filter.only_media'
            defaultMessage='Media only'
          />
        </button>

        <AuthorFilter accountId={accountId} onChange={onAccountChange} />

        {filtered && (
          <button
            type='button'
            className='bookmark-filter-bar__chip bookmark-filter-bar__reset'
            onClick={onClearAll}
          >
            <Icon id='bookmark-filter-reset' icon={CloseIcon} />
            <FormattedMessage
              id='bookmarks.filter.reset'
              defaultMessage='Reset'
            />
          </button>
        )}

        <button
          type='button'
          className={classNames(
            'bookmark-filter-bar__chip',
            'bookmark-filter-bar__select',
            { 'bookmark-filter-bar__chip--active': selecting },
          )}
          aria-pressed={selecting}
          onClick={handleSelectClick}
        >
          <FormattedMessage
            id='bookmarks.select.toggle'
            defaultMessage='Select'
          />
        </button>
      </div>
    </div>
  );
};
