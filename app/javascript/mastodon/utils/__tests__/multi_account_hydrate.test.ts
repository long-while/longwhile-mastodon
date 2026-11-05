import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MultiAccountEntry } from '../../types/multi_account';

const loadAllEntries = vi.fn();

vi.mock('../multi_account_db', () => ({
  loadAllEntries: () => loadAllEntries() as Promise<unknown>,
}));

// 세션 계정(`me`)은 서버가 렌더한 값이다. 테스트마다 갈아끼운다.
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
  // 첫 `import()` 가 모듈 변환 비용을 떠안는다. 전체 테스트를 병렬로 돌려 PC 가
  // 바쁠 때 그 비용만으로 첫 테스트가 5초 제한을 넘겼다. 여기서 미리 한 번
  // 불러 둔다(변환 결과는 `resetModules` 뒤에도 남는다).
  beforeAll(async () => {
    await import('../multi_account_storage');
  }, 30000);

  beforeEach(() => {
    vi.resetModules();
    loadAllEntries.mockReset();
    sessionAccountId = 'A';
  });

  // 회귀 방지: 활성 계정은 **세션**이 정한다. 로컬 기록(lastUsedAt 이 가장
  // 최근인 항목 등)이 이기면 화면의 '나' 와 목록의 '현재 계정' 이 갈라져
  // 초록 체크가 두 계정에 찍히고 전환이 막힌다.
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

  // 저장 키와 항목의 id 가 어긋난 기록이 남아 있어도, 리듀서가 쓰는 키(id)로
  // 맞춰 넣는다. 아니면 목록에서 누른 계정을 찾지 못한다.
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

  // 로그인돼 있으면 목록에 자기 자신이 늘 있어야 한다.
  it('adds the session account when it has no stored entry', async () => {
    loadAllEntries.mockResolvedValue({ B: entry('B') });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    const { accounts, activeAccountId } = lastHydratePayload(store);

    expect(activeAccountId).toEqual('A');
    expect(accounts.A?.id).toEqual('A');
  });

  // 로그아웃 상태에서는 활성 계정이 없다.
  it('reports no active account when signed out', async () => {
    sessionAccountId = undefined;
    loadAllEntries.mockResolvedValue({ B: entry('B') });

    const store = createStore();
    const { hydrateStore } = await import('../multi_account_storage');
    await hydrateStore(store as never);

    expect(lastHydratePayload(store).activeAccountId).toBeNull();
  });
});
