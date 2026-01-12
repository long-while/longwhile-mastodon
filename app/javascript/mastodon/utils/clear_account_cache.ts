import SwitchLogger from './switch_logger';

const LOCAL_STORAGE_ALLOWLIST = new Set<string>([]);
const IDB_PRESERVE_NAMES = new Set(['multiAccountStore', 'multiAccountCryptoKeys']);

const clearSessionStorage = (): void => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.clear();
  } catch (error) {
    console.warn('Failed to clear sessionStorage during account switch:', error);
  }
};

const clearLocalStorage = (): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && !LOCAL_STORAGE_ALLOWLIST.has(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Failed to clear localStorage during account switch:', error);
  }
};

const deleteIndexedDB = async (name: string): Promise<void> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch (error) {
      console.warn(`Failed to delete IndexedDB database ${name}:`, error);
      resolve();
    }
  });
};

const clearIndexedDBCaches = async (): Promise<void> => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return;
  }

  if (typeof indexedDB.databases === 'function') {
    try {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases
          .filter(db => db.name && !IDB_PRESERVE_NAMES.has(db.name))
          .map(db => deleteIndexedDB(db.name!)),
      );
      return;
    } catch (error) {
      console.warn('Failed to enumerate IndexedDB databases:', error);
    }
  }

  const fallbackDatabases = ['mastodonCache', 'mastodonTimelineCache', 'mastodonMediaCache'];
  await Promise.all(
    fallbackDatabases
      .filter(name => !IDB_PRESERVE_NAMES.has(name))
      .map(name => deleteIndexedDB(name)),
  );
};

const clearServiceWorkerCaches = async (): Promise<void> => {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  } catch (error) {
    console.warn('Failed to clear Service Worker caches:', error);
  }
};

const notifyStreamingReset = (): void => {
  if (typeof navigator === 'undefined') {
    return;
  }

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: 'SWITCH_ACCOUNT_RESET' });
    }
  } catch (error) {
    console.warn('Failed to notify Service Worker about stream reset:', error);
  }
};

export const clearAccountCache = async (): Promise<void> => {
  try {
    clearSessionStorage();
    clearLocalStorage();

    await Promise.all([clearIndexedDBCaches(), clearServiceWorkerCaches()]);

    notifyStreamingReset();

    SwitchLogger.logCacheClear(true);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    SwitchLogger.logCacheClear(false, errorMessage);
    throw error;
  }
};

