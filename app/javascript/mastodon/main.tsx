import { createRoot } from 'react-dom/client';

import { setupBrowserNotifications } from 'mastodon/actions/notifications';
import Mastodon from 'mastodon/containers/mastodon';
import { me } from 'mastodon/initial_state';
import * as perf from 'mastodon/performance';
import ready from 'mastodon/ready';
import { store } from 'mastodon/store';
import api, { setActiveAccountToken } from 'mastodon/api';
import { importFetchedAccount } from 'mastodon/actions/importer';
import { setActiveAccountMeta } from 'mastodon/actions/multi_account';
import {
  deleteEncryptedToken,
  loadAllEntries,
  loadEncryptedToken,
} from 'mastodon/utils/multi_account_db';
import { decryptToken } from 'mastodon/utils/multi_account_crypto';
import {
  clearActiveAccountIdInStorage,
  getActiveAccountIdFromStorage,
  setActiveAccountIdInStorage,
} from 'mastodon/utils/multi_account_storage';

import { isProduction, isDevelopment } from './utils/environment';

const redirectTo = (path: string): void => {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return;
  }

  if (path === 'reload') {
    window.location.reload();
    return;
  }

  window.location.href = path;
};

const pickFallbackAccount = (
  entries: Record<string, { lastUsedAt?: string | null }>,
): string | null => {
  const ids = Object.keys(entries);
  if (ids.length === 0) {
    return null;
  }

  return ids
    .map((id) => ({
      id,
      lastUsedAt: entries[id]?.lastUsedAt
        ? new Date(entries[id].lastUsedAt as string).getTime()
        : 0,
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.id ?? ids[0];
};

async function handleAccountInitError(accountId: string): Promise<void> {
  console.warn(`Account ${accountId} failed to initialize, removing...`);

  try {
    await deleteEncryptedToken(accountId);
  } catch (error) {
    console.error(`Failed to delete encrypted token for ${accountId}:`, error);
  }

  clearActiveAccountIdInStorage();

  try {
    const remainingEntries = await loadAllEntries();
    const fallbackId = pickFallbackAccount(remainingEntries);

    if (fallbackId) {
      setActiveAccountIdInStorage(fallbackId);
      redirectTo('/home');
    } else {
      redirectTo('/auth/sign_in');
    }
  } catch (error) {
    console.error('Failed to determine fallback account after init error:', error);
    redirectTo('/auth/sign_in');
  }
}

const STORAGE_RETRY_LIMIT = 3;
const STORAGE_RETRY_DELAY_MS = 100;

const delay = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const getActiveAccountIdWithRetry = async (): Promise<string | null> => {
  let attempt = 0;
  let activeAccountId = getActiveAccountIdFromStorage();

  while (!activeAccountId && attempt < STORAGE_RETRY_LIMIT) {
    attempt += 1;
    await delay(STORAGE_RETRY_DELAY_MS);
    activeAccountId = getActiveAccountIdFromStorage();
  }

  return activeAccountId;
};

async function initializeActiveAccountSession(): Promise<boolean> {
  const activeAccountId = await getActiveAccountIdWithRetry();

  if (!activeAccountId) {
    return true;
  }

  try {
    const encryptedPayload = await loadEncryptedToken(activeAccountId);

    if (!encryptedPayload) {
      clearActiveAccountIdInStorage();
      redirectTo('/auth/sign_in');
      return false;
    }

    const token = await decryptToken(encryptedPayload);
    setActiveAccountToken(token);

    try {
      const response = await api().get('/api/v1/accounts/verify_credentials');
      store.dispatch(importFetchedAccount(response.data));
      const resolvedAccountId = response.data?.id ?? activeAccountId;
      if (resolvedAccountId) {
        store.dispatch(setActiveAccountMeta(resolvedAccountId));
      }
    } catch (verifyError) {
      console.error(
        'Failed to verify credentials during active account initialization:',
        verifyError,
      );
    }

    return true;
  } catch (error) {
    console.error('Failed to restore active multi-account session:', error);
    await handleAccountInitError(activeAccountId);
    return false;
  }
}

function main() {
  perf.start('main()');

  return ready(async () => {
    const initialized = await initializeActiveAccountSession();
    if (!initialized) {
      return;
    }

    const mountNode = document.getElementById('mastodon');
    if (!mountNode) {
      throw new Error('Mount node not found');
    }
    const props = JSON.parse(
      mountNode.getAttribute('data-props') ?? '{}',
    ) as Record<string, unknown>;

    const root = createRoot(mountNode);
    root.render(<Mastodon {...props} />);
    store.dispatch(setupBrowserNotifications());

    if (isProduction() && me && 'serviceWorker' in navigator) {
      const { Workbox } = await import('workbox-window');
      const wb = new Workbox(
        isDevelopment() ? '/packs-dev/dev-sw.js?dev-sw' : '/sw.js',
        { type: 'module', scope: '/' },
      );
      let registration;

      try {
        registration = await wb.register();
      } catch (err) {
        console.error(err);
      }

      if (
        registration &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const registerPushNotifications = await import(
          'mastodon/actions/push_notifications'
        );

        store.dispatch(registerPushNotifications.register());
      }
    }

    perf.stop('main()');
  });
}

// eslint-disable-next-line import/no-default-export
export default main;
