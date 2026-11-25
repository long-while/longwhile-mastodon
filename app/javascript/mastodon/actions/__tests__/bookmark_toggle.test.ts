import { configureStore } from '@reduxjs/toolkit';

import type { Status } from 'mastodon/models/status';
import { rootReducer } from 'mastodon/reducers';

import {
  bookmarkStatus,
  DETAILS_TIMEOUT_MS,
  unbookmarkStatus,
} from '../bookmark_toggle';
import { importStatuses } from '../importer';

const order: string[] = [];
const post = vi.fn();
const apiGetBookmarkDetails = vi.fn();
const apiSetBookmarkNote = vi.fn();
const apiSetStatusBookmarkFolders = vi.fn();

vi.mock('../../api', () => ({
  default: () => ({
    post: (url: string) => {
      order.push(`post ${url}`);
      return post(url) as unknown;
    },
  }),
}));

vi.mock('../../api/bookmark_folders', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiGetBookmarkDetails: (ids: string[]) => {
    order.push('details');
    return apiGetBookmarkDetails(ids) as unknown;
  },
  apiSetBookmarkNote: (id: string, note: string) =>
    apiSetBookmarkNote(id, note) as unknown,
  apiSetStatusBookmarkFolders: (id: string, folderIds: string[]) =>
    apiSetStatusBookmarkFolders(id, folderIds) as unknown,
}));

vi.mock('../importer', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const raw = original.importStatuses as (s: unknown[]) => unknown;

  return {
    ...original,
    importFetchedStatus: (status: unknown) => raw([status]),
    importFetchedStatuses: (statuses: unknown[]) => raw(statuses),
  };
});

const ID = '101';

const makeStore = (bookmarked: boolean) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(importStatuses([{ id: ID, bookmarked }]));
  return store;
};

type TestStore = ReturnType<typeof makeStore>;

const statusOf = (store: TestStore): Status => {
  const status = store.getState().statuses.get(ID);
  if (!status) throw new Error(`status ${ID} is not in the store`);
  return status;
};

const lastAlert = (store: TestStore) => store.getState().alerts.at(-1);

const messageId = (store: TestStore) => {
  const message = lastAlert(store)?.message;
  return typeof message === 'object' ? message.id : message;
};

beforeEach(() => {
  order.length = 0;
  post.mockReset();
  apiGetBookmarkDetails.mockReset();
  apiSetBookmarkNote.mockReset();
  apiSetStatusBookmarkFolders.mockReset();
  vi.useRealTimers();
});

describe('bookmarkStatus', () => {
  it('shows a toast whose action opens the folder adder', async () => {
    const store = makeStore(false);
    post.mockResolvedValue({ data: { id: ID, bookmarked: true } });

    await store.dispatch(bookmarkStatus(statusOf(store)));

    expect(messageId(store)).toBe('bookmark_toast.bookmarked');
    expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(true);

    lastAlert(store)?.onClick?.();

    expect(store.getState().alerts).toHaveLength(0);
    const modal = store.getState().modal.get('stack').first();
    expect(modal?.get('modalType')).toBe('BOOKMARK_FOLDER_ADDER');
    expect(modal?.get('modalProps')).toEqual({ statusId: ID });
  });

  it('keeps only the latest bookmark toast', async () => {
    const store = makeStore(false);
    post.mockResolvedValue({ data: { id: ID, bookmarked: true } });

    await store.dispatch(bookmarkStatus(statusOf(store)));
    await store.dispatch(bookmarkStatus(statusOf(store)));

    expect(store.getState().alerts).toHaveLength(1);
  });

  it('shows no toast when the request fails', async () => {
    const store = makeStore(false);
    post.mockRejectedValue(new Error('network'));

    await store.dispatch(bookmarkStatus(statusOf(store)));

    expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(false);
    expect(
      store.getState().alerts.some((alert) => alert.action !== undefined),
    ).toBe(false);
  });
});

describe('unbookmarkStatus', () => {
  it('reads details before unbookmarking and undo restores folders and note', async () => {
    const store = makeStore(true);
    apiGetBookmarkDetails.mockResolvedValue([
      { status_id: ID, note: 'remember', folder_ids: ['1', '2'] },
    ]);
    post.mockResolvedValue({ data: { id: ID, bookmarked: false } });
    apiSetStatusBookmarkFolders.mockResolvedValue({
      folder_ids: ['1', '2'],
      status: { id: ID, bookmarked: true },
    });
    apiSetBookmarkNote.mockResolvedValue({
      status_id: ID,
      note: 'remember',
      folder_ids: ['1', '2'],
    });

    await store.dispatch(unbookmarkStatus(statusOf(store)));

    expect(order).toEqual([
      'details',
      `post /api/v1/statuses/${ID}/unbookmark`,
    ]);
    expect(messageId(store)).toBe('bookmark_toast.unbookmarked_with_folders');
    expect(lastAlert(store)?.values).toEqual({ count: 2 });
    expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(false);

    lastAlert(store)?.onClick?.();
    await vi.waitFor(() => {
      expect(apiSetBookmarkNote).toHaveBeenCalledWith(ID, 'remember');
    });

    expect(apiSetStatusBookmarkFolders).toHaveBeenCalledWith(ID, ['1', '2']);
    expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(true);
    const bookmarkIds = store
      .getState()
      .status_lists.getIn(['bookmarks', 'items']) as {
      has: (id: string) => boolean;
    };
    expect(bookmarkIds.has(ID)).toBe(true);
    expect(store.getState().bookmarkDetails[ID]).toEqual({
      note: 'remember',
      folderIds: ['1', '2'],
    });
  });

  it('undo is a no-op when pressed twice', async () => {
    const store = makeStore(true);
    apiGetBookmarkDetails.mockResolvedValue([]);
    post.mockResolvedValue({ data: { id: ID, bookmarked: false } });

    await store.dispatch(unbookmarkStatus(statusOf(store)));

    expect(messageId(store)).toBe('bookmark_toast.unbookmarked');
    const onClick = lastAlert(store)?.onClick;

    post.mockResolvedValue({ data: { id: ID, bookmarked: true } });
    onClick?.();
    onClick?.();
    await vi.waitFor(() => {
      expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(true);
    });

    const rebookmarks = order.filter((entry) => entry.endsWith('/bookmark'));
    expect(rebookmarks).toHaveLength(1);
    expect(apiSetBookmarkNote).not.toHaveBeenCalled();
    expect(store.getState().alerts).toHaveLength(0);
  });

  it('undo is a no-op after the toast was dismissed', async () => {
    const store = makeStore(true);
    apiGetBookmarkDetails.mockResolvedValue([]);
    post.mockResolvedValue({ data: { id: ID, bookmarked: false } });

    await store.dispatch(unbookmarkStatus(statusOf(store)));
    const alert = lastAlert(store);
    store.dispatch({ type: 'alerts/clear' });

    alert?.onClick?.();
    await Promise.resolve();

    expect(order.filter((entry) => entry.endsWith('/bookmark'))).toHaveLength(
      0,
    );
  });

  it('still unbookmarks without restore info when details time out', async () => {
    vi.useFakeTimers();
    const store = makeStore(true);
    apiGetBookmarkDetails.mockReturnValue(new Promise(() => undefined));
    post.mockResolvedValue({ data: { id: ID, bookmarked: false } });

    const done = store.dispatch(unbookmarkStatus(statusOf(store)));

    expect(store.getState().statuses.getIn([ID, 'bookmarked'])).toBe(false);

    await vi.advanceTimersByTimeAsync(DETAILS_TIMEOUT_MS);
    await done;

    expect(order).toContain(`post /api/v1/statuses/${ID}/unbookmark`);
    expect(messageId(store)).toBe('bookmark_toast.unbookmarked');
  });

  it('shows an error when undo fails', async () => {
    const store = makeStore(true);
    apiGetBookmarkDetails.mockResolvedValue([
      { status_id: ID, note: '', folder_ids: ['9'] },
    ]);
    post.mockResolvedValue({ data: { id: ID, bookmarked: false } });
    apiSetStatusBookmarkFolders.mockRejectedValue(new Error('boom'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await store.dispatch(unbookmarkStatus(statusOf(store)));
    lastAlert(store)?.onClick?.();

    await vi.waitFor(() => {
      expect(messageId(store)).toBe('bookmark_toast.undo_failed');
    });
    expect(store.getState().alerts).toHaveLength(1);
    consoleError.mockRestore();
  });
});
