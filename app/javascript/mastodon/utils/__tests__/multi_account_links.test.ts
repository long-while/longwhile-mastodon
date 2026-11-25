import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiAccountEntry } from '../../types/multi_account';
import {
  filterLinkedEntries,
  loadLinkedEntries,
  loadLinkedEntriesDetailed,
  resetLinkedAccountIdsCache,
} from '../multi_account_links';

const loadAllEntries = vi.fn();
const get = vi.fn();

vi.mock('../multi_account_db', () => ({
  loadAllEntries: () => loadAllEntries() as Promise<unknown>,
}));

vi.mock('mastodon/api', () => ({
  default: () => ({ get: (...args: unknown[]) => get(...args) as unknown }),
}));

let sessionAccountId: string | null = 'A';

vi.mock('mastodon/initial_state', () => ({
  get me() {
    return sessionAccountId;
  },
}));

const entry = (id: string): MultiAccountEntry => ({
  id,
  acct: `user${id}`,
  displayName: `User ${id}`,
  avatar: '',
  encryptedTokenRef: '',
  lastUsedAt: '2026-01-01T00:00:00.000Z',
});

describe('filterLinkedEntries', () => {
  const entries = { A: entry('A'), B: entry('B'), C: entry('C') };

  it('keeps linked accounts and the session account', () => {
    expect(
      Object.keys(filterLinkedEntries(entries, new Set(['B']), 'A')),
    ).toEqual(['A', 'B']);
  });

  it('keeps only the session account when the links are unknown', () => {
    expect(Object.keys(filterLinkedEntries(entries, null, 'A'))).toEqual(['A']);
  });

  it('does not modify the given set', () => {
    const linked = new Set(['B']);
    filterLinkedEntries(entries, linked, 'A');
    expect([...linked]).toEqual(['B']);
  });

  it('matches entries by their id even when the storage key differs', () => {
    const misKeyed = { oldKey: entry('B') };
    expect(
      Object.keys(filterLinkedEntries(misKeyed, new Set(['B']), 'A')),
    ).toEqual(['oldKey']);
  });
});

describe('loadLinkedEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessionAccountId = 'A';
    resetLinkedAccountIdsCache();
    loadAllEntries.mockResolvedValue({
      A: entry('A'),
      B: entry('B'),
      C: entry('C'),
    });
  });

  it('hides accounts saved by somebody else on this browser', async () => {
    get.mockResolvedValue({ data: { account_ids: ['A', 'B'] } });

    const entries = await loadLinkedEntries();

    expect(Object.keys(entries)).toEqual(['A', 'B']);
    expect(get).toHaveBeenCalledWith(
      '/api/v1/multi_accounts/links',
      expect.anything(),
    );
  });

  it('fails closed and asks again next time when the server cannot answer', async () => {
    get.mockRejectedValueOnce(new Error('offline'));

    expect(Object.keys(await loadLinkedEntries())).toEqual(['A']);

    get.mockResolvedValue({ data: { account_ids: ['A', 'C'] } });

    expect(Object.keys(await loadLinkedEntries())).toEqual(['A', 'C']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('asks the server only once per page', async () => {
    get.mockResolvedValue({ data: { account_ids: ['A'] } });

    await loadLinkedEntries();
    await loadLinkedEntries();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('asks again after the cache is reset (an account was added or removed)', async () => {
    get.mockResolvedValue({ data: { account_ids: ['A'] } });

    await loadLinkedEntries();
    resetLinkedAccountIdsCache();
    get.mockResolvedValue({ data: { account_ids: ['A', 'B'] } });

    expect(Object.keys(await loadLinkedEntries())).toEqual(['A', 'B']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not touch the server or the database when signed out', async () => {
    sessionAccountId = null;

    expect(await loadLinkedEntries()).toEqual({});
    expect(get).not.toHaveBeenCalled();
    expect(loadAllEntries).not.toHaveBeenCalled();
  });
});

describe('loadLinkedEntriesDetailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessionAccountId = 'A';
    resetLinkedAccountIdsCache();
    loadAllEntries.mockResolvedValue({
      A: entry('A'),
      B: entry('B'),
      C: entry('C'),
    });
  });

  it('counts the saved accounts that are no longer linked', async () => {
    get.mockResolvedValue({ data: { account_ids: ['A', 'B'] } });

    const result = await loadLinkedEntriesDetailed();

    expect(result.droppedCount).toBe(1);
    expect(result.linksFailed).toBe(false);
  });

  it('reports a failed request instead of silently hiding the accounts', async () => {
    get.mockRejectedValue(new Error('offline'));

    const result = await loadLinkedEntriesDetailed();

    expect(Object.keys(result.entries)).toEqual(['A']);
    expect(result.droppedCount).toBe(2);
    expect(result.linksFailed).toBe(true);
  });

  it('reports nothing dropped when every saved account is linked', async () => {
    get.mockResolvedValue({ data: { account_ids: ['A', 'B', 'C'] } });

    expect(await loadLinkedEntriesDetailed()).toMatchObject({
      droppedCount: 0,
      linksFailed: false,
    });
  });
});
