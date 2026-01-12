import { clearAccountCache } from '../clear_account_cache';

describe('clearAccountCache', () => {
  let originalSessionStorage: any;
  let originalLocalStorage: any;
  let originalIndexedDB: any;
  let originalCaches: any;
  let originalNavigator: any;

  beforeEach(() => {
    originalSessionStorage = global.sessionStorage;
    originalLocalStorage = global.localStorage;
    originalIndexedDB = (global as any).indexedDB;
    originalCaches = (global as any).caches;
    originalNavigator = global.navigator;

    const localStore: Record<string, string> = { keep: 'value', drop: 'value' };

    global.sessionStorage = {
      clear: jest.fn(),
    } as unknown as Storage;

    global.localStorage = {
      get length() {
        return Object.keys(localStore).length;
      },
      key: jest
        .fn()
        .mockImplementation((index: number) => Object.keys(localStore)[index] ?? null),
      removeItem: jest.fn((key: string) => {
        delete localStore[key];
      }),
    } as unknown as Storage;

    const deleteDatabaseMock = jest.fn(() => {
      const request: any = {};
      setTimeout(() => {
        request.onsuccess?.(null);
      }, 0);
      return request;
    });

    (global as any).indexedDB = {
      databases: jest.fn().mockResolvedValue([
        { name: 'mastodonCache' },
        { name: 'multiAccountStore' },
      ]),
      deleteDatabase: deleteDatabaseMock,
    };

    (global as any).caches = {
      keys: jest.fn().mockResolvedValue(['cache-a']),
      delete: jest.fn().mockResolvedValue(true),
    };

    global.navigator = {
      serviceWorker: {
        controller: {
          postMessage: jest.fn(),
        },
      },
    } as unknown as Navigator;
  });

  afterEach(() => {
    global.sessionStorage = originalSessionStorage;
    global.localStorage = originalLocalStorage;
    (global as any).indexedDB = originalIndexedDB;
    (global as any).caches = originalCaches;
    global.navigator = originalNavigator;
  });

  it('clears storages, caches, and notifies service worker', async () => {
    await clearAccountCache();

    expect(global.sessionStorage.clear).toHaveBeenCalled();
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('drop');
    expect((global as any).indexedDB.databases).toHaveBeenCalled();
    expect((global as any).indexedDB.deleteDatabase).toHaveBeenCalledWith('mastodonCache');
    expect((global as any).caches.keys).toHaveBeenCalled();
    expect((global as any).caches.delete).toHaveBeenCalledWith('cache-a');
    expect(
      global.navigator.serviceWorker?.controller?.postMessage,
    ).toHaveBeenCalledWith({ type: 'SWITCH_ACCOUNT_RESET' });
  });
});

