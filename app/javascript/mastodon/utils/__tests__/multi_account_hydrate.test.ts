import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiAccountEntry } from '../../types/multi_account';

const loadAllEntries = vi.fn();

vi.mock('../multi_account_db', () => ({
  loadAllEntries: () => loadAllEntries() as Promise<unknown>,
}));

let sessionAccountId: string | undefined = 'A';

vi.mock('../../initial_state', () => ({
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

const createStore = () => {
  const dispatched: { type: string; payload: unknown }[] = [];

  return {
    dispatched,
    getState: () => ({ getIn: () => undefined }),
    dispatch: (action: { type: string; payload: unknown }) => {
      dispatched.push(action);
      return action;
    },
  };
};

const lastHydratePayload = (store: ReturnType<typeof createStore>) => {
  const action = store.dispatched.find(
    (a) => a.type === 'MULTI_ACCOUNT_HYDRATE',
  );

  return action?.payload as {
    activeAccountId: string | null;
    accounts: Record<string, MultiAccountEntry>;
  };
};

describe('multi-account hydrateStore', () => {
  beforeAll(async () => {
    await import('../multi_account_storage');
  }, 30000);

  beforeEach(() => {
    vi.resetModules();
    loadAllEntries.mockReset();
    sessionAccountId = 'A';
  });

  it('marks the session account active even when another entry was used later', async () => {
    loadAllEntries.mockResolvedValue({
      A: entry('A'),
      B: { ...entry('B'), lastUsedAt: '2026-09-01T00:00:00.000Z' },
    });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    expect(lastHydratePayload(store).activeAccountId).toEqual('A');
  });

  it('keys accounts by the entry id, not by the storage key', async () => {
    loadAllEntries.mockResolvedValue({
      'stale-key': entry('B'),
    });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    const { accounts } = lastHydratePayload(store);

    expect(Object.keys(accounts).sort()).toEqual(['A', 'B']);
    expect(accounts.B?.id).toEqual('B');
  });

  it('adds the session account when it has no stored entry', async () => {
    loadAllEntries.mockResolvedValue({ B: entry('B') });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    const { accounts, activeAccountId } = lastHydratePayload(store);

    expect(activeAccountId).toEqual('A');
    expect(accounts.A?.id).toEqual('A');
  });

  it('reports no active account when signed out', async () => {
    sessionAccountId = undefined;
    loadAllEntries.mockResolvedValue({ B: entry('B') });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    expect(lastHydratePayload(store).activeAccountId).toBeNull();
  });
});
