import { fromJS } from 'immutable';
import { Provider } from 'react-redux';

import StatusActionBarComponent from 'mastodon/components/status_action_bar';
import { store } from 'mastodon/store';
import { fireEvent, render, screen } from 'mastodon/test_helpers';

import { BookmarkContext } from '../bookmark_context';
import type { BookmarkContextValue } from '../bookmark_context';
import { BookmarkNote } from '../components/bookmark_note';

const StatusActionBar = StatusActionBarComponent as unknown as React.FC<{
  status: unknown;
}>;

const status = fromJS({
  id: '10',
  url: 'https://example.com/@bob/10',
  visibility: 'private',
  bookmarked: true,
  favourited: false,
  reblogged: false,
  muted: false,
  pinned: false,
  in_reply_to_id: null,
  replies_count: 0,
  reblogs_count: 0,
  favourites_count: 0,
  account: { id: '2', username: 'bob', acct: 'bob' },
});

const contextValue = (
  overrides: Partial<BookmarkContextValue> = {},
): BookmarkContextValue => ({
  details: {},
  onEditNote: vi.fn(),
  onRemoveFromFolder: vi.fn(),
  ...overrides,
});

const renderBar = (value: BookmarkContextValue | null) =>
  render(
    <Provider store={store}>
      <BookmarkContext.Provider value={value}>
        <StatusActionBar status={status} />
      </BookmarkContext.Provider>
    </Provider>,
  );

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
};

describe('bookmark items in the status menu', () => {
  it('are absent outside the bookmarks page', () => {
    renderBar(null);
    openMenu();

    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Remove from this folder' }),
    ).toBeNull();
  });

  it('offer "add note" on every tab and "remove from this folder" in a folder', () => {
    const value = contextValue({ folderId: '7' });
    renderBar(value);
    openMenu();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove from this folder' }),
    );
    expect(value.onRemoveFromFolder).toHaveBeenCalledWith('10');

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(value.onEditNote).toHaveBeenCalledWith('10');
  });

  it('say "edit note" when the post already has one, and hide folder removal outside folders', () => {
    renderBar(
      contextValue({ details: { '10': { note: '레시피', folderIds: [] } } }),
    );
    openMenu();

    expect(screen.getByRole('button', { name: 'Edit note' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Remove from this folder' }),
    ).toBeNull();
  });
});

describe('<BookmarkNote />', () => {
  it('renders the note as plain text only inside the provider', () => {
    const note = '<b>not html</b>\nsecond line';
    const { container, rerender } = render(
      <BookmarkContext.Provider
        value={contextValue({ details: { '10': { note, folderIds: [] } } })}
      >
        <BookmarkNote statusId='10' />
      </BookmarkContext.Provider>,
    );

    const text = container.querySelector('.bookmark-note__text');
    expect(text?.textContent).toBe(`Note: ${note}`);
    expect(container.querySelector('b')).toBeNull();

    rerender(<BookmarkNote statusId='10' />);
    expect(container.querySelector('.bookmark-note')).toBeNull();
  });

  it('opens the note editor when the note is clicked', () => {
    const onEditNote = vi.fn();
    render(
      <BookmarkContext.Provider
        value={contextValue({
          details: { '10': { note: 'later', folderIds: [] } },
          onEditNote,
        })}
      >
        <BookmarkNote statusId='10' />
      </BookmarkContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /later/ }));
    expect(onEditNote).toHaveBeenCalledWith('10');
  });
});
