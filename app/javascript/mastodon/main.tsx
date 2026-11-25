import { createRoot } from 'react-dom/client';

import { defineMessages } from 'react-intl';

import { showAlert } from 'mastodon/actions/alerts';
import { importFetchedAccount } from 'mastodon/actions/importer';
import { setupBrowserNotifications } from 'mastodon/actions/notifications';
import api, { setActiveAccountToken } from 'mastodon/api';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from 'mastodon/api/multi_accounts_constants';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import Mastodon from 'mastodon/containers/mastodon';
import { getAccessToken, me } from 'mastodon/initial_state';
import * as perf from 'mastodon/performance';
import ready from 'mastodon/ready';
import { store } from 'mastodon/store';
import { installPushPresenceResponder } from 'mastodon/utils/push_presence';
import { decryptToken } from 'mastodon/utils/multi_account_crypto';
import {
  deleteEncryptedToken,
  loadEncryptedToken,
} from 'mastodon/utils/multi_account_db';
import {
  clearActiveAccountIdInStorage,
  getActiveAccountIdFromStorage,
  setActiveAccountIdInStorage,
  takeSwitchIntent,
} from 'mastodon/utils/multi_account_storage';

import { isProduction, isDevelopment } from './utils/environment';

const messages = defineMessages({
  switchNotApplied: {
    id: 'account_switcher.switch_not_applied',
    defaultMessage: 'The account could not be switched. Please try again.',
  },
});

const reportUnappliedSwitch = (sessionAccountId: string | null): void => {
  const intendedAccountId = takeSwitchIntent();

  if (!intendedAccountId || intendedAccountId === sessionAccountId) {
    return;
  }

  console.error(
    `[MultiAccount] Switch to ${intendedAccountId} did not stick; the session is ${
      sessionAccountId ?? 'signed out'
    }.`,
  );
  store.dispatch(showAlert({ message: messages.switchNotApplied }));
};

async function initializeActiveAccountSession(): Promise<void> {
  const sessionAccountId = me ?? null;

  reportUnappliedSwitch(sessionAccountId);

  if (!sessionAccountId) {
    clearActiveAccountIdInStorage();
    return;
  }

  if (getActiveAccountIdFromStorage() !== sessionAccountId) {
    setActiveAccountIdInStorage(sessionAccountId);
  }

  if (getAccessToken()) {
    return;
  }

  try {
    const encryptedPayload = await loadEncryptedToken(sessionAccountId);

    if (!encryptedPayload) {
      return;
    }

    const token = await decryptToken(encryptedPayload);

    const response = await api().get<ApiAccountJSON>(
      '/api/v1/accounts/verify_credentials',
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
      },
    );

    if (response.data.id !== sessionAccountId) {
      console.error(
        `[MultiAccount] Stored token for ${sessionAccountId} belongs to ${response.data.id}; discarding it.`,
      );
      await deleteEncryptedToken(sessionAccountId);
      return;
    }

    setActiveAccountToken(token);
    store.dispatch(importFetchedAccount(response.data));
  } catch (error) {
    console.error(
      'Failed to restore the stored token for the current session:',
      error,
    );
  }
}

function main() {
  perf.start('main()');

  return ready(async () => {
    await initializeActiveAccountSession();

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

    installPushPresenceResponder(
      () => {
        const state = store.getState() as {
          getIn: (path: string[]) => unknown;
        };

        return (
          state.getIn([
            'settings',
            'notifications',
            'suppressPushWhileActive',
          ]) !== false
        );
      },
      () => {
        const state = store.getState() as {
          getIn: (path: string[]) => unknown;
        };

        return state.getIn(['timelines', 'home', 'online']) === true;
      },
    );

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
