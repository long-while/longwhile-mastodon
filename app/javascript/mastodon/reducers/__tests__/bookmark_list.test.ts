import { Map as ImmutableMap } from 'immutable';

import {
  createBookmarkFolder,
  deleteBookmarkFolder,
  fetchBookmarkFolders,
  renameBookmarkFolder,
} from '../../actions/bookmark_folders';
import {
  addStatusesToBookmarkFolder,
  bookmarkListKey,
  chunkIds,
  fetchBookmarkDetails,
  fetchBookmarkList,
  parseBookmarkListKey,
  removeBookmarks,
  removeStatusesFromBookmarkFolder,
  setBookmarkNote,
} from '../../actions/bookmark_list';
import {
  BOOKMARK_SUCCESS,
  UNBOOKMARK_SUCCESS,
} from '../../actions/interactions';
import type { BookmarkQuery } from '../../api_types/bookmark_folders';
import { bookmarkDetailsReducer } from '../bookmark_details';
import { bookmarkFoldersReducer } from '../bookmark_folders';
import statusLists from '../status_lists';
import statuses from '../statuses';

const folder = (id: string, position: number, name = `F${id}`, count = 0) => ({
  id,
  name,
  position,
  statuses_count: count,
});

type ListsState = ReturnType<typeof statusLists>;

const items = (state: ListsState, key: string) =>
  (
    state.getIn([key, 'items']) as { toArray: () => string[] } | undefined
  )?.toArray();

let requestSeq = 0;

const load = (state: ListsState, query: BookmarkQuery, statusIds: string[]) => {
  requestSeq += 1;
  const requestId = `req-${requestSeq}`;
  const arg = { query };
  const started = statusLists(state, fetchBookmarkList.pending(requestId, arg));

  return statusLists(
    started,
    fetchBookmarkList.fulfilled(
      { key: bookmarkListKey(query), statusIds, next: null, append: false },
      requestId,
      arg,
    ),
  );
};

describe('bookmarkFoldersReducer — stale fetch race', () => {
  const initial = bookmarkFoldersReducer(undefined, { type: '@@INIT' });

  it('ignores a fetch that started before a create finished', () => {
    let state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.pending('slow', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      createBookmarkFolder.fulfilled(folder('9', 0, 'New'), 'c', {
        name: 'New',
      }),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.fulfilled([], 'slow', undefined),
    );

    expect(state.items.map((f) => f.id)).toEqual(['9']);
    expect(state.stale).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('ignores a fetch that started before a rename or delete', () => {
    let state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.fulfilled(
        [folder('1', 0), folder('2', 1)],
        'first',
        undefined,
      ),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.pending('slow', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      renameBookmarkFolder.fulfilled(folder('1', 0, '읽을 것'), 'r', {
        id: '1',
        name: '읽을 것',
      }),
    );
    state = bookmarkFoldersReducer(
      state,
      deleteBookmarkFolder.fulfilled({ id: '2' }, 'd', { id: '2' }),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.fulfilled(
        [folder('1', 0), folder('2', 1)],
        'slow',
        undefined,
      ),
    );

    expect(state.items).toEqual([folder('1', 0, '읽을 것')]);
  });

  it('accepts a fetch that started after the last mutation and clears stale', () => {
    let state = bookmarkFoldersReducer(
      initial,
      createBookmarkFolder.fulfilled(folder('9', 0), 'c', { name: 'F9' }),
    );
    state = bookmarkFoldersReducer(
      state,
      removeBookmarks.fulfilled({ statusIds: ['1'], partial: false }, 'rm', {
        statusIds: ['1'],
      }),
    );
    expect(state.stale).toBe(true);

    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.pending('fresh', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.fulfilled(
        [folder('9', 0, 'F9', 3)],
        'fresh',
        undefined,
      ),
    );

    expect(state.items[0]?.statuses_count).toBe(3);
    expect(state.stale).toBe(false);
  });

  it('keeps loading while an overlapping fetch is still running', () => {
    let state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.pending('a', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.pending('b', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.fulfilled([folder('1', 0)], 'a', undefined),
    );

    expect(state.isLoading).toBe(true);
  });

  it('marks counts stale after folder membership or bookmarks change', () => {
    const actions = [
      addStatusesToBookmarkFolder.fulfilled(
        { folderId: '1', statusIds: ['5'], partial: false },
        'x',
        { folderId: '1', statusIds: ['5'] },
      ),
      removeStatusesFromBookmarkFolder.fulfilled(
        { folderId: '1', statusIds: ['5'], partial: false },
        'x',
        { folderId: '1', statusIds: ['5'] },
      ),
      { type: UNBOOKMARK_SUCCESS, status: ImmutableMap({ id: '5' }) },
    ];

    actions.forEach((action) => {
      expect(bookmarkFoldersReducer(initial, action).stale).toBe(true);
    });
  });
});

describe('bookmark list keys', () => {
  it('keeps the legacy keys for unfiltered lists', () => {
    expect(bookmarkListKey({})).toBe('bookmarks');
    expect(bookmarkListKey({ folderId: '3' })).toBe('bookmarks:3');
    expect(bookmarkListKey({ folderId: 'none' })).toBe('bookmarks:none');
  });

  it('adds a filter suffix and ignores blank search text', () => {
    expect(bookmarkListKey({ q: '   ' })).toBe('bookmarks');
    expect(
      bookmarkListKey({
        folderId: '3',
        q: ' a|b ',
        onlyMedia: true,
        accountId: '7',
      }),
    ).toBe('bookmarks:3|q=a%7Cb&media&account=7');
  });

  it('parses keys back into scope and filter flag', () => {
    expect(parseBookmarkListKey('bookmarks')).toEqual({
      scope: 'all',
      filtered: false,
    });
    expect(parseBookmarkListKey('bookmarks:all|media')).toEqual({
      scope: 'all',
      filtered: true,
    });
    expect(parseBookmarkListKey('bookmarks:none')).toEqual({
      scope: 'none',
      filtered: false,
    });
    expect(parseBookmarkListKey('favourites')).toBeNull();
  });

  it('splits ids into batches of 40', () => {
    const ids = Array.from({ length: 81 }, (_, i) => `${i}`);
    expect(chunkIds(ids).map((c) => c.length)).toEqual([40, 40, 1]);
  });
});

describe('status_lists — bookmark page lists', () => {
  const initial = statusLists(undefined, { type: '@@INIT' });

  it('ignores a response for a list that was invalidated meanwhile', () => {
    const arg = { query: { folderId: '1' } };
    let state = statusLists(initial, fetchBookmarkList.pending('old', arg));
    state = state.delete('bookmarks:1');
    state = statusLists(
      state,
      fetchBookmarkList.fulfilled(
        { key: 'bookmarks:1', statusIds: ['1'], next: null, append: false },
        'old',
        arg,
      ),
    );

    expect(state.has('bookmarks:1')).toBe(false);
  });

  it('ignores an older response once a newer request started', () => {
    const arg = { query: { folderId: '1' } };
    let state = statusLists(initial, fetchBookmarkList.pending('old', arg));
    state = statusLists(state, fetchBookmarkList.pending('new', arg));
    state = statusLists(
      state,
      fetchBookmarkList.fulfilled(
        { key: 'bookmarks:1', statusIds: ['stale'], next: null, append: false },
        'old',
        arg,
      ),
    );
    expect(items(state, 'bookmarks:1')).toEqual([]);

    state = statusLists(
      state,
      fetchBookmarkList.fulfilled(
        { key: 'bookmarks:1', statusIds: ['fresh'], next: null, append: false },
        'new',
        arg,
      ),
    );
    expect(items(state, 'bookmarks:1')).toEqual(['fresh']);
  });

  it('invalidates the target folder and leaves unsorted after a bulk add', () => {
    let state = load(initial, { folderId: '1' }, ['9']);
    state = load(state, { folderId: '1', q: 'cake' }, ['9']);
    state = load(state, { folderId: 'none' }, ['5', '4']);
    state = load(state, {}, ['9', '5', '4']);

    state = statusLists(
      state,
      addStatusesToBookmarkFolder.fulfilled(
        { folderId: '1', statusIds: ['5'], partial: false },
        'x',
        { folderId: '1', statusIds: ['5'] },
      ),
    );

    expect(state.has('bookmarks:1')).toBe(false);
    expect(state.has('bookmarks:1|q=cake')).toBe(false);
    expect(items(state, 'bookmarks:none')).toEqual(['4']);
    expect(items(state, 'bookmarks')).toEqual(['9', '5', '4']);
  });

  it('removes from the folder lists and drops unsorted lists after a removal', () => {
    let state = load(initial, { folderId: '1' }, ['9', '8']);
    state = load(state, { folderId: '1', onlyMedia: true }, ['8']);
    state = load(state, { folderId: 'none' }, ['5']);

    state = statusLists(
      state,
      removeStatusesFromBookmarkFolder.fulfilled(
        { folderId: '1', statusIds: ['8'], partial: false },
        'x',
        { folderId: '1', statusIds: ['8'] },
      ),
    );

    expect(items(state, 'bookmarks:1')).toEqual(['9']);
    expect(items(state, 'bookmarks:1|media')).toEqual([]);
    expect(state.has('bookmarks:none')).toBe(false);
  });

  it('removes bulk-unbookmarked statuses from every bookmark list', () => {
    let state = load(initial, {}, ['9', '8', '7']);
    state = load(state, { folderId: '1' }, ['9', '8']);
    state = load(state, { q: 'x' }, ['8']);

    state = statusLists(
      state,
      removeBookmarks.fulfilled(
        { statusIds: ['8', '9'], partial: false },
        'x',
        { statusIds: ['8', '9'] },
      ),
    );

    expect(items(state, 'bookmarks')).toEqual(['7']);
    expect(items(state, 'bookmarks:1')).toEqual([]);
    expect(items(state, 'bookmarks:all|q=x')).toEqual([]);
  });

  it('removes a single unbookmark from filtered and unsorted lists too', () => {
    let state = load(initial, { folderId: 'none' }, ['5']);
    state = load(state, { q: 'x' }, ['5']);

    state = statusLists(state, {
      type: UNBOOKMARK_SUCCESS,
      status: ImmutableMap({ id: '5' }),
    });

    expect(items(state, 'bookmarks:none')).toEqual([]);
    expect(items(state, 'bookmarks:all|q=x')).toEqual([]);
  });

  it('puts a new bookmark at the top of the unsorted list', () => {
    let state = load(initial, { folderId: 'none' }, ['5']);

    state = statusLists(state, {
      type: BOOKMARK_SUCCESS,
      status: ImmutableMap({ id: '6' }),
    });

    expect(items(state, 'bookmarks:none')).toEqual(['6', '5']);
    expect(items(state, 'bookmarks')).toEqual(['6']);
  });

  it('forgets every list of a deleted folder and the unsorted lists', () => {
    let state = load(initial, { folderId: '1' }, ['9']);
    state = load(state, { folderId: '1', q: 'a' }, ['9']);
    state = load(state, { folderId: 'none' }, ['5']);
    state = load(state, { folderId: '2' }, ['5']);

    state = statusLists(
      state,
      deleteBookmarkFolder.fulfilled({ id: '1' }, 'd', { id: '1' }),
    );

    expect(state.has('bookmarks:1')).toBe(false);
    expect(state.has('bookmarks:1|q=a')).toBe(false);
    expect(state.has('bookmarks:none')).toBe(false);
    expect(items(state, 'bookmarks:2')).toEqual(['5']);
  });
});

describe('statuses — bulk unbookmark', () => {
  it('clears the bookmarked flag of removed statuses', () => {
    const before = ImmutableMap({
      '8': ImmutableMap({ id: '8', bookmarked: true }),
    }) as unknown as Parameters<typeof statuses>[0];
    const state = statuses(
      before,
      removeBookmarks.fulfilled(
        { statusIds: ['8', 'missing'], partial: false },
        'x',
        { statusIds: ['8', 'missing'] },
      ),
    );

    expect(state.getIn(['8', 'bookmarked'])).toBe(false);
    expect(state.has('missing')).toBe(false);
  });
});

describe('bookmarkDetailsReducer', () => {
  const initial = bookmarkDetailsReducer(undefined, { type: '@@INIT' });
  const withDetails = bookmarkDetailsReducer(
    initial,
    fetchBookmarkDetails.fulfilled(
      {
        requested: ['1', '2'],
        details: [
          { status_id: '1', note: '레시피', folder_ids: ['7'] },
          { status_id: '2', note: '', folder_ids: [] },
        ],
      },
      'x',
      { statusIds: ['1', '2'] },
    ),
  );

  it('stores fetched details and forgets ids that are no longer bookmarked', () => {
    expect(withDetails['1']).toEqual({ note: '레시피', folderIds: ['7'] });

    const state = bookmarkDetailsReducer(
      withDetails,
      fetchBookmarkDetails.fulfilled({ requested: ['2'], details: [] }, 'y', {
        statusIds: ['2'],
      }),
    );

    expect(state['2']).toBeUndefined();
    expect(state['1']).toBeDefined();
  });

  it('updates the note after saving', () => {
    const state = bookmarkDetailsReducer(
      withDetails,
      setBookmarkNote.fulfilled(
        { status_id: '2', note: '나중에', folder_ids: [] },
        'x',
        { statusId: '2', note: '나중에' },
      ),
    );

    expect(state['2']?.note).toBe('나중에');
  });

  it('follows folder membership changes', () => {
    let state = bookmarkDetailsReducer(
      withDetails,
      addStatusesToBookmarkFolder.fulfilled(
        { folderId: '8', statusIds: ['1', '2'], partial: false },
        'x',
        { folderId: '8', statusIds: ['1', '2'] },
      ),
    );
    expect(state['1']?.folderIds).toEqual(['7', '8']);
    expect(state['2']?.folderIds).toEqual(['8']);

    state = bookmarkDetailsReducer(
      state,
      removeStatusesFromBookmarkFolder.fulfilled(
        { folderId: '7', statusIds: ['1'], partial: false },
        'x',
        { folderId: '7', statusIds: ['1'] },
      ),
    );
    expect(state['1']?.folderIds).toEqual(['8']);

    state = bookmarkDetailsReducer(
      state,
      deleteBookmarkFolder.fulfilled({ id: '8' }, 'd', { id: '8' }),
    );
    expect(state['1']?.folderIds).toEqual([]);
  });

  it('forgets details when bookmarks are removed', () => {
    let state = bookmarkDetailsReducer(
      withDetails,
      removeBookmarks.fulfilled({ statusIds: ['1'], partial: false }, 'x', {
        statusIds: ['1'],
      }),
    );
    expect(state['1']).toBeUndefined();

    state = bookmarkDetailsReducer(state, {
      type: UNBOOKMARK_SUCCESS,
      status: ImmutableMap({ id: '2' }),
    });
    expect(state['2']).toBeUndefined();
  });
});
