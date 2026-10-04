import { clearAccountCache } from '../clear_account_cache';

describe('clearAccountCache', () => {
  const sessionClear = vi.fn();
  const localRemoveItem = vi.fn();
  const databases = vi.fn();
  const deleteDatabase = vi.fn();
  const cacheKeys = vi.fn();
  const cacheDelete = vi.fn();
  const postMessage = vi.fn();

  beforeEach(() => {
    const localStore = new Map([
      ['keep', 'value'],
      ['drop', 'value'],
    ]);

    localRemoveItem.mockImplementation((key: string) => {
      localStore.delete(key);
    });
    databases.mockResolvedValue([
      { name: 'mastodonCache' },
      { name: 'multiAccountStore' },
    ]);
    deleteDatabase.mockImplementation(() => {
      const request: { onsuccess?: (event: unknown) => void } = {};
      setTimeout(() => {
        request.onsuccess?.(null);
      }, 0);
      return request;
    });
    cacheKeys.mockResolvedValue(['cache-a']);
    cacheDelete.mockResolvedValue(true);

    vi.stubGlobal('sessionStorage', { clear: sessionClear });
    vi.stubGlobal('localStorage', {
      get length() {
        return localStore.size;
      },
      key: (index: number) => Array.from(localStore.keys())[index] ?? null,
      removeItem: localRemoveItem,
    });
    vi.stubGlobal('indexedDB', { databases, deleteDatabase });
    vi.stubGlobal('caches', { keys: cacheKeys, delete: cacheDelete });
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: { postMessage } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('clears storages, caches, and notifies service worker', async () => {
    await clearAccountCache();

    expect(sessionClear).toHaveBeenCalled();
    expect(localRemoveItem).toHaveBeenCalledWith('drop');
    expect(databases).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith('mastodonCache');
    expect(deleteDatabase).not.toHaveBeenCalledWith('multiAccountStore');
    expect(cacheKeys).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('cache-a');
    expect(postMessage).toHaveBeenCalledWith({ type: 'SWITCH_ACCOUNT_RESET' });
  });
});
