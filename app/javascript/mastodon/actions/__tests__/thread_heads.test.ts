import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThreadHeadState } from '../../reducers/thread_heads';
import { threadHeadsReducer } from '../../reducers/thread_heads';
import {
  fetchThreadHeads,
  fetchThreadHeadsForTimeline,
  threadHeadTargetIds,
  timelineHasThreadPreview,
} from '../thread_heads';

const apiGetThreadHeads = vi.fn();

vi.mock('../../api/thread_heads', () => ({
  THREAD_HEADS_MAX_IDS: 40,
  apiGetThreadHeads: (ids: string[]) => apiGetThreadHeads(ids) as unknown,
}));

const imported: unknown[] = [];
vi.mock('../importer', () => ({
  importFetchedStatuses: (statuses: unknown[]) => {
    imported.push(...statuses);
    return { type: 'STATUSES_IMPORT_TEST' };
  },
}));

const makeStore = (me: string | null = '1') => {
  let heads: Record<string, ThreadHeadState> = {};

  const getState = () =>
    ({
      get: (key: string) => (key === 'thread_heads' ? heads : undefined),
      getIn: (path: string[]) =>
        path[0] === 'meta' && path[1] === 'me' ? me : undefined,
    }) as never;

  const dispatch = (action: unknown): unknown => {
    if (typeof action === 'function') {
      return (action as (d: unknown, g: unknown) => unknown)(
        dispatch,
        getState,
      );
    }
    heads = threadHeadsReducer(heads, action as never);
    return action;
  };

  return { dispatch, heads: () => heads };
};

const head = (id: string) => ({ id, content: `<p>${id}</p>` });

beforeEach(() => {
  apiGetThreadHeads.mockReset();
  imported.length = 0;
});

describe('threadHeadTargetIds', () => {
  it('asks only for replies, uses the boosted post for boosts and skips DMs', () => {
    expect(
      threadHeadTargetIds([
        { id: '1', in_reply_to_id: null },
        { id: '2', in_reply_to_id: '1' },
        { id: '3', reblog: { id: '30', in_reply_to_id: '29' } },
        { id: '4', reblog: { id: '40', in_reply_to_id: null } },
        { id: '5', in_reply_to_id: '4', visibility: 'direct' },
      ]),
    ).toEqual(['2', '30']);
  });
});

describe('timelineHasThreadPreview', () => {
  it('is on for home, public (and its variants) and local only', () => {
    expect(timelineHasThreadPreview('home')).toBe(true);
    expect(timelineHasThreadPreview('public')).toBe(true);
    expect(timelineHasThreadPreview('public:media')).toBe(true);
    expect(timelineHasThreadPreview('community')).toBe(true);
    expect(timelineHasThreadPreview('account:1')).toBe(false);
    expect(timelineHasThreadPreview('list:1')).toBe(false);
    expect(timelineHasThreadPreview('direct')).toBe(false);
  });
});

describe('fetchThreadHeads', () => {
  it('stores the head and omitted count, and marks ids without a head as none', async () => {
    apiGetThreadHeads.mockResolvedValue([
      { status_id: '2', omitted_count: 0, head: head('1') },
      { status_id: '4', omitted_count: 2, head: head('1') },
    ]);
    const store = makeStore();

    await store.dispatch(fetchThreadHeads(['2', '3', '4']));

    expect(apiGetThreadHeads).toHaveBeenCalledWith(['2', '3', '4']);
    expect(store.heads()).toEqual({
      '2': { headId: '1', omitted: 0 },
      '3': 'none',
      '4': { headId: '1', omitted: 2 },
    });
    expect(imported).toEqual([head('1'), head('1')]);
  });

  it('never asks twice for the same id (answered, pending or failed)', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    apiGetThreadHeads.mockReturnValueOnce(
      new Promise((_resolve) => {
        resolve = _resolve;
      }),
    );
    const store = makeStore();

    const first = store.dispatch(fetchThreadHeads(['2']));
    expect(store.heads()).toEqual({ '2': 'pending' });

    await store.dispatch(fetchThreadHeads(['2', '2']));
    resolve([]);
    await first;
    await store.dispatch(fetchThreadHeads(['2']));

    expect(apiGetThreadHeads).toHaveBeenCalledTimes(1);
  });

  it('splits more than 40 ids into several requests', async () => {
    apiGetThreadHeads.mockResolvedValue([]);
    const ids = Array.from({ length: 85 }, (_, i) => String(i + 1));

    await makeStore().dispatch(fetchThreadHeads(ids));

    expect(
      apiGetThreadHeads.mock.calls.map(([batch]) => (batch as string[]).length),
    ).toEqual([40, 40, 5]);
  });

  it('falls back quietly when the request fails', async () => {
    apiGetThreadHeads.mockRejectedValue(new Error('boom'));
    const store = makeStore();

    await expect(
      store.dispatch(fetchThreadHeads(['2'])),
    ).resolves.toBeUndefined();

    expect(store.heads()).toEqual({ '2': 'none' });
  });
});

describe('fetchThreadHeadsForTimeline', () => {
  it('asks for the replies of a home page', async () => {
    apiGetThreadHeads.mockResolvedValue([]);

    await makeStore().dispatch(
      fetchThreadHeadsForTimeline('home', [
        { id: '1', in_reply_to_id: null },
        { id: '2', in_reply_to_id: '1' },
      ]),
    );

    expect(apiGetThreadHeads).toHaveBeenCalledWith(['2']);
  });

  it('does nothing for other timelines, pages without replies, or when signed out', async () => {
    const replies = [{ id: '2', in_reply_to_id: '1' }];

    await makeStore().dispatch(
      fetchThreadHeadsForTimeline('account:1', replies),
    );
    await makeStore().dispatch(
      fetchThreadHeadsForTimeline('home', [{ id: '1', in_reply_to_id: null }]),
    );
    await makeStore(null).dispatch(
      fetchThreadHeadsForTimeline('public', replies),
    );

    expect(apiGetThreadHeads).not.toHaveBeenCalled();
  });
});
