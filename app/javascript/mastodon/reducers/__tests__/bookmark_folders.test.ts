import { Map as ImmutableMap } from 'immutable';

import {
  createBookmarkFolder,
  deleteBookmarkFolder,
  fetchBookmarkFolders,
  renameBookmarkFolder,
  reorderBookmarkFolders,
  setStatusBookmarkFolders,
} from '../../actions/bookmark_folders';
import { fetchBookmarkList } from '../../actions/bookmark_list';
import { UNBOOKMARK_SUCCESS } from '../../actions/interactions';
import { moveFolderId } from '../../features/bookmark_folders/folder_manager_modal';
import { bookmarkFoldersReducer } from '../bookmark_folders';
import statusLists from '../status_lists';

const folder = (id: string, position: number, name = `F${id}`) => ({
  id,
  name,
  position,
  statuses_count: 0,
});

const items = (state: ReturnType<typeof statusLists>, key: string) =>
  (
    state.getIn([key, 'items']) as { toArray: () => string[] } | undefined
  )?.toArray();

const loadFolder = (
  state: ReturnType<typeof statusLists>,
  folderId: string,
  statusIds: string[],
) => {
  const arg = { query: { folderId } };
  const requestId = `req-${folderId}`;
  const started = statusLists(state, fetchBookmarkList.pending(requestId, arg));

  return statusLists(
    started,
    fetchBookmarkList.fulfilled(
      { key: `bookmarks:${folderId}`, statusIds, next: null, append: false },
      requestId,
      arg,
    ),
  );
};

describe('bookmarkFoldersReducer', () => {
  const initial = bookmarkFoldersReducer(undefined, { type: '@@INIT' });

  it('sorts fetched folders by position', () => {
    const state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.fulfilled(
        [folder('2', 1), folder('1', 0)],
        'req',
        undefined,
      ),
    );

    expect(state.items.map((f) => f.id)).toEqual(['1', '2']);
    expect(state.loaded).toBe(true);
  });

  it('tracks loading and failure of the folder list', () => {
    let state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.pending('req', undefined),
    );
    expect(state.isLoading).toBe(true);
    expect(state.loaded).toBe(false);

    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.rejected(new Error('boom'), 'req', undefined),
    );
    expect(state.isLoading).toBe(false);
    expect(state.hasError).toBe(true);

    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.fulfilled([folder('1', 0)], 'req', undefined),
    );
    expect(state.isLoading).toBe(false);
    expect(state.hasError).toBe(false);
    expect(state.loaded).toBe(true);
  });

  it('keeps the loaded list while it is reloaded', () => {
    let state = bookmarkFoldersReducer(
      initial,
      fetchBookmarkFolders.fulfilled([folder('1', 0)], 'req', undefined),
    );
    state = bookmarkFoldersReducer(
      state,
      fetchBookmarkFolders.pending('req', undefined),
    );

    expect(state.isLoading).toBe(true);
    expect(state.loaded).toBe(true);
    expect(state.items.map((f) => f.id)).toEqual(['1']);
  });

  it('adds, renames, reorders and deletes', () => {
    let state = bookmarkFoldersReducer(
      initial,
      createBookmarkFolder.fulfilled(folder('1', 0), 'req', { name: 'F1' }),
    );
    state = bookmarkFoldersReducer(
      state,
      createBookmarkFolder.fulfilled(folder('2', 1), 'req', { name: 'F2' }),
    );
    state = bookmarkFoldersReducer(
      state,
      renameBookmarkFolder.fulfilled(folder('1', 0, '읽을 것'), 'req', {
        id: '1',
        name: '읽을 것',
      }),
    );
    expect(state.items[0]?.name).toBe('읽을 것');

    state = bookmarkFoldersReducer(
      state,
      reorderBookmarkFolders.fulfilled(
        [folder('2', 0), folder('1', 1, '읽을 것')],
        'req',
        { folderIds: ['2', '1'] },
      ),
    );
    expect(state.items.map((f) => f.id)).toEqual(['2', '1']);

    state = bookmarkFoldersReducer(
      state,
      deleteBookmarkFolder.fulfilled({ id: '2' }, 'req', { id: '2' }),
    );
    expect(state.items.map((f) => f.id)).toEqual(['1']);
  });
});

describe('status_lists — bookmark folder lists', () => {
  const initial = statusLists(undefined, { type: '@@INIT' });

  it('creates the list on first load and appends further pages', () => {
    const arg = { query: { folderId: '7' } };
    let state = statusLists(initial, fetchBookmarkList.pending('req', arg));
    expect(state.getIn(['bookmarks:7', 'isLoading'])).toBe(true);

    state = statusLists(
      state,
      fetchBookmarkList.fulfilled(
        {
          key: 'bookmarks:7',
          statusIds: ['30', '20'],
          next: 'n',
          append: false,
        },
        'req',
        arg,
      ),
    );
    state = statusLists(
      state,
      fetchBookmarkList.fulfilled(
        { key: 'bookmarks:7', statusIds: ['10'], next: null, append: true },
        'req2',
        { ...arg, url: 'n' },
      ),
    );

    expect(items(state, 'bookmarks:7')).toEqual(['30', '20', '10']);
    expect(state.getIn(['bookmarks:7', 'isLoading'])).toBe(false);
  });

  it('removes the status from folders it left and drops lists it newly joined', () => {
    let state = loadFolder(initial, '1', ['20']);
    state = loadFolder(state, '2', ['40', '30']);

    state = statusLists(
      state,
      setStatusBookmarkFolders.fulfilled(
        { statusId: '30', folderIds: ['1'] },
        'req',
        { statusId: '30', folderIds: ['1'] },
      ),
    );

    expect(state.has('bookmarks:1')).toBe(false);
    expect(items(state, 'bookmarks:2')).toEqual(['40']);
    expect(state.has('bookmarks:3')).toBe(false);
  });

  it('keeps a folder list that already contains the status', () => {
    let state = loadFolder(initial, '1', ['30', '20']);

    state = statusLists(
      state,
      setStatusBookmarkFolders.fulfilled(
        { statusId: '30', folderIds: ['1'] },
        'req',
        { statusId: '30', folderIds: ['1'] },
      ),
    );

    expect(items(state, 'bookmarks:1')).toEqual(['30', '20']);
  });

  it('drops an unbookmarked status from every folder and the main list', () => {
    let state = loadFolder(initial, '1', ['20', '10']);
    state = loadFolder(state, '2', ['20']);

    state = statusLists(state, {
      type: UNBOOKMARK_SUCCESS,
      status: ImmutableMap({ id: '20' }),
    });

    expect(items(state, 'bookmarks:1')).toEqual(['10']);
    expect(items(state, 'bookmarks:2')).toEqual([]);
  });

  it('forgets the list of a deleted folder', () => {
    let state = loadFolder(initial, '1', ['20']);

    state = statusLists(
      state,
      deleteBookmarkFolder.fulfilled({ id: '1' }, 'req', { id: '1' }),
    );

    expect(state.has('bookmarks:1')).toBe(false);
  });
});

describe('moveFolderId', () => {
  it('moves one id up or down and refuses moves past the ends', () => {
    expect(moveFolderId(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveFolderId(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveFolderId(['a', 'b'], 0, -1)).toBeNull();
    expect(moveFolderId(['a', 'b'], 1, 1)).toBeNull();
  });
});
