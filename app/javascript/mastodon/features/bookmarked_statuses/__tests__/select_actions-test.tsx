import { IntlProvider } from 'react-intl';

import { List as ImmutableList } from 'immutable';
import { Provider } from 'react-redux';

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

import {
  apiAddStatusesToBookmarkFolder,
  apiRemoveBookmarks,
  apiRemoveStatusesFromBookmarkFolder,
} from 'mastodon/api/bookmark_folders';
import { store } from 'mastodon/store';

import { BookmarkSelectActions } from '../components/select_actions';
import { selectionRange, useSelectMode } from '../use_bookmark_page';

vi.mock('mastodon/api/bookmark_folders');

const folders = [
  { id: '1', name: 'Read later', position: 0, statuses_count: 1 },
  { id: '2', name: 'Recipes', position: 1, statuses_count: 2 },
];

const renderActions = (
  props: Partial<React.ComponentProps<typeof BookmarkSelectActions>> = {},
) => {
  const handlers = {
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onAddToFolder: vi.fn(),
    onRemoveFromFolder: vi.fn(),
    onUnbookmark: vi.fn(),
    onDone: vi.fn(),
  };

  render(
    <Provider store={store}>
      <IntlProvider locale='en'>
        <BookmarkSelectActions
          selectedCount={2}
          loadedCount={5}
          folders={folders}
          busy={false}
          {...handlers}
          {...props}
        />
      </IntlProvider>
    </Provider>,
  );

  return handlers;
};

const button = (name: string) => screen.getByRole('button', { name });

describe('<BookmarkSelectActions />', () => {
  it('announces the selection count and runs the actions', () => {
    const handlers = renderActions({ currentFolderId: '1' });

    expect(screen.getByRole('status').textContent).toBe('2 selected');

    fireEvent.click(button('Select all'));
    expect(handlers.onSelectAll).toHaveBeenCalled();

    fireEvent.click(button('Remove from this folder'));
    expect(handlers.onRemoveFromFolder).toHaveBeenCalled();

    fireEvent.click(button('Remove bookmarks'));
    expect(handlers.onUnbookmark).toHaveBeenCalled();
  });

  it('offers "remove from this folder" only on a folder tab', () => {
    renderActions();

    expect(
      screen.queryByRole('button', { name: 'Remove from this folder' }),
    ).toBeNull();
  });

  it('disables actions when nothing is selected', () => {
    renderActions({ selectedCount: 0 });

    expect((button('Remove bookmarks') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((button('Add to folder') as HTMLButtonElement).disabled).toBe(true);
  });

  it('turns "select all" into "deselect all" once everything is selected', () => {
    const handlers = renderActions({ selectedCount: 5 });

    fireEvent.click(button('Deselect all'));
    expect(handlers.onClearSelection).toHaveBeenCalled();
  });

  it('lists the other folders as targets', async () => {
    const handlers = renderActions({ currentFolderId: '1' });

    fireEvent.click(button('Add to folder'));
    fireEvent.click(await screen.findByRole('button', { name: 'Recipes' }));

    expect(handlers.onAddToFolder).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('button', { name: 'Read later' })).toBeNull();
  });
});

interface TopModal {
  modalType: string;
  modalProps: { onConfirm: () => void; title: string };
}

const topModal = () => {
  const modal = store.getState().modal.get('stack').first();

  return {
    modalType: modal?.get('modalType'),
    modalProps: modal?.get('modalProps') as TopModal['modalProps'],
  };
};

const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `${i + 1}`);

const renderSelectMode = (statusIds: string[], folderId?: string) =>
  renderHook(
    () =>
      useSelectMode({
        statusIds: ImmutableList(statusIds),
        listKey: 'bookmarks',
        folderId,
        folders,
      }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>
          <IntlProvider locale='en'>{children}</IntlProvider>
        </Provider>
      ),
    },
  );

describe('selectionRange', () => {
  const list = ImmutableList(['a', 'b', 'c', 'd', 'e']);

  it('covers everything between the anchor and the clicked post, either way', () => {
    expect(selectionRange(list, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(selectionRange(list, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to the clicked post when there is no usable anchor', () => {
    expect(selectionRange(list, null, 'c')).toEqual(['c']);
    expect(selectionRange(list, 'gone', 'c')).toEqual(['c']);
  });
});

describe('useSelectMode', () => {
  beforeEach(() => {
    vi.mocked(apiAddStatusesToBookmarkFolder)
      .mockReset()
      .mockImplementation((_folderId, part) =>
        Promise.resolve({ status_ids: part }),
      );
    vi.mocked(apiRemoveStatusesFromBookmarkFolder)
      .mockReset()
      .mockImplementation((_folderId, part) =>
        Promise.resolve({ status_ids: part }),
      );
    vi.mocked(apiRemoveBookmarks)
      .mockReset()
      .mockImplementation((part) => Promise.resolve({ status_ids: part }));
  });

  it('selects a range with shift and unselects a range the same way', () => {
    const { result } = renderSelectMode(ids(6));

    act(() => {
      result.current.toggle('2', true);
    });
    act(() => {
      result.current.toggle('5', true, true);
    });
    expect([...result.current.selected].sort()).toEqual(['2', '3', '4', '5']);

    act(() => {
      result.current.toggle('3', false, true);
    });
    expect([...result.current.selected].sort()).toEqual(['2']);
  });

  it('adds every selected post to a folder in batches of 40 and leaves select mode', async () => {
    const { result } = renderSelectMode(ids(45));

    act(() => {
      result.current.changeSelecting(true);
    });
    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selected.size).toBe(45);

    act(() => {
      result.current.addSelectedToFolder('2');
    });

    await waitFor(() => {
      expect(result.current.selecting).toBe(false);
    });
    expect(apiAddStatusesToBookmarkFolder).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(apiAddStatusesToBookmarkFolder).mock.calls[0]?.[1],
    ).toHaveLength(40);
    expect(
      vi.mocked(apiAddStatusesToBookmarkFolder).mock.calls[1]?.[1],
    ).toHaveLength(5);
    expect(result.current.selected.size).toBe(0);
  });

  it('removes the selected posts from the current folder', async () => {
    const { result } = renderSelectMode(ids(3), '1');

    act(() => {
      result.current.changeSelecting(true);
      result.current.toggle('2', true);
    });
    act(() => {
      result.current.removeSelectedFromFolder();
    });

    await waitFor(() => {
      expect(apiRemoveStatusesFromBookmarkFolder).toHaveBeenCalledWith('1', [
        '2',
      ]);
    });
  });

  it('asks for confirmation before removing bookmarks', async () => {
    const { result } = renderSelectMode(ids(3));

    act(() => {
      result.current.toggle('1', true);
      result.current.toggle('3', true);
    });
    act(() => {
      result.current.unbookmarkSelected();
    });

    expect(apiRemoveBookmarks).not.toHaveBeenCalled();
    const modal = topModal();
    expect(modal.modalType).toBe('CONFIRM');
    expect(modal.modalProps.title).toBe('Remove 2 bookmarks?');

    act(() => {
      modal.modalProps.onConfirm();
    });

    await waitFor(() => {
      expect(apiRemoveBookmarks).toHaveBeenCalledWith(['1', '3']);
    });
  });

  it('keeps the selection when the first batch fails', async () => {
    vi.mocked(apiRemoveBookmarks).mockRejectedValue(new Error('boom'));
    const { result } = renderSelectMode(ids(2));

    act(() => {
      result.current.changeSelecting(true);
      result.current.toggle('1', true);
    });
    act(() => {
      result.current.unbookmarkSelected();
    });
    const modal = topModal();
    act(() => {
      modal.modalProps.onConfirm();
    });

    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(result.current.selecting).toBe(true);
    expect(result.current.selected.has('1')).toBe(true);
  });
});
