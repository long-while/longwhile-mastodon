import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

const messages = defineMessages({
  toolbar: {
    id: 'bookmarks.select.toolbar',
    defaultMessage: 'Actions for selected bookmarks',
  },
});

export const BookmarkSelectActions: React.FC<{
  selectedCount: number;
  loadedCount: number;
  busy: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMove: () => void;
  onUnbookmark: () => void;
}> = ({
  selectedCount,
  loadedCount,
  busy,
  onSelectAll,
  onClearSelection,
  onMove,
  onUnbookmark,
}) => {
  const intl = useIntl();
  const nothing = selectedCount === 0;

  return (
    <div
      className='bookmark-select-actions'
      role='toolbar'
      aria-label={intl.formatMessage(messages.toolbar)}
    >
      <button
        type='button'
        className='bookmark-select-actions__button'
        onClick={nothing ? onSelectAll : onClearSelection}
        disabled={busy || loadedCount === 0}
      >
        {nothing ? (
          <FormattedMessage
            id='bookmarks.select.all'
            defaultMessage='Select all'
          />
        ) : (
          <>
            <FormattedMessage
              id='bookmarks.select.clear'
              defaultMessage='Deselect all'
            />{' '}
            <span className='bookmark-select-actions__count'>
              ({selectedCount})
            </span>
          </>
        )}
      </button>

      <button
        type='button'
        className='bookmark-select-actions__button'
        onClick={onMove}
        disabled={busy || nothing}
      >
        <FormattedMessage id='bookmarks.select.move' defaultMessage='Move' />
      </button>

      <button
        type='button'
        className={classNames(
          'bookmark-select-actions__button',
          'bookmark-select-actions__button--dangerous',
        )}
        onClick={onUnbookmark}
        disabled={busy || nothing}
      >
        <FormattedMessage
          id='bookmarks.select.unbookmark'
          defaultMessage='Remove bookmarks'
        />
      </button>
    </div>
  );
};
