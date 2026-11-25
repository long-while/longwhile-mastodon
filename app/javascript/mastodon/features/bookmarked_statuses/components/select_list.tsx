import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
import ScrollableList from 'mastodon/components/scrollable_list';
import type { Status } from 'mastodon/models/status';
import { useAppSelector } from 'mastodon/store';

const EXCERPT_MAX = 140;

const excerptOf = (status: Status) => {
  const spoiler = (status.get('spoiler_text') as string | undefined) ?? '';
  const text =
    spoiler || ((status.get('search_index') as string | undefined) ?? '');
  const oneLine = text.replace(/\s+/g, ' ').trim();

  return oneLine.length > EXCERPT_MAX
    ? `${oneLine.slice(0, EXCERPT_MAX)}…`
    : oneLine;
};

const mediaCount = (status: Status) =>
  (status.get('media_attachments') as { size: number } | undefined)?.size ?? 0;

const excerptNode = (status: Status): React.ReactNode => {
  const text = excerptOf(status);
  if (text) return text;

  const count = mediaCount(status);
  if (count === 0) return null;

  return (
    <FormattedMessage
      id='bookmarks.select.media_only'
      defaultMessage='{count, plural, one {# attachment} other {# attachments}}'
      values={{ count }}
    />
  );
};

export const BookmarkSelectRow: React.FC<{
  statusId: string;
  checked: boolean;
  onToggle: (statusId: string, checked: boolean, extend?: boolean) => void;
}> = ({ statusId, checked, onToggle }) => {
  const status = useAppSelector((state) => state.statuses.get(statusId));
  const account = useAppSelector((state) =>
    status ? state.accounts.get(status.get('account') as string) : undefined,
  );
  const note = useAppSelector((state) => state.bookmarkDetails[statusId]?.note);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const native = e.nativeEvent as Partial<MouseEvent>;
      onToggle(statusId, e.target.checked, native.shiftKey === true);
    },
    [statusId, onToggle],
  );

  return (
    <label className='bookmark-select-row'>
      <input
        type='checkbox'
        className='bookmark-select-row__checkbox'
        checked={checked}
        onChange={handleChange}
      />

      <span className='bookmark-select-row__avatar'>
        <Avatar account={account} size={36} />
      </span>

      <span className='bookmark-select-row__body'>
        <span className='bookmark-select-row__name'>
          {account ? (
            <DisplayName account={account} />
          ) : (
            <FormattedMessage
              id='bookmarks.select.unavailable'
              defaultMessage='Post not available'
            />
          )}
        </span>

        {status && (
          <span className='bookmark-select-row__excerpt'>
            {excerptNode(status)}
          </span>
        )}

        {note && (
          <span className='bookmark-select-row__note'>
            <FormattedMessage id='bookmark_note.label' defaultMessage='Note' />
            {': '}
            {note}
          </span>
        )}
      </span>
    </label>
  );
};

export const BookmarkSelectList: React.FC<{
  statusIds: string[];
  selected: ReadonlySet<string>;
  onToggle: (statusId: string, checked: boolean, extend?: boolean) => void;
  scrollKey: string;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  emptyMessage: React.ReactNode;
  bindToDocument: boolean;
}> = ({ statusIds, selected, onToggle, ...listProps }) => (
  <ScrollableList
    {...listProps}
    showLoading={listProps.isLoading && statusIds.length === 0}
    trackScroll={false}
    className='bookmark-select-list'
  >
    {statusIds.map((id) => (
      <BookmarkSelectRow
        key={id}
        statusId={id}
        checked={selected.has(id)}
        onToggle={onToggle}
      />
    ))}
  </ScrollableList>
);
