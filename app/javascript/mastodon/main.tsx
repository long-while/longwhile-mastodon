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

// 전환 직전에 남겨 둔 표식과 실제로 로그인된 계정을 맞춰 본다. 다르면 서버가
// 내려준 세션이 붙지 않았거나 다른 계정으로 붙은 것이다 — 조용히 넘어가면
// 사용자에게는 "눌러도 아무 일도 일어나지 않는" 것으로 보인다.
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

// @_longwhile — **누가 로그인돼 있는지는 세션 쿠키만 안다.**
//
//   `MA_ACTIVE_ACCOUNT_ID` 는 "마지막으로 전환한 계정" 을 적어 둔 힌트일 뿐이다.
//   보통은 세션과 같지만, 일반 로그아웃 뒤 다른 계정으로 로그인하거나 세션이
//   만료되면 **가리키는 계정과 실제 세션이 어긋난 채로 남는다.**
//
//   예전에는 이 포인터를 믿고 그 계정의 저장된 토큰을 전역 bearer 로 깔고
//   `meta.me` 까지 덮어썼다. 그래서 어긋나는 순간
//     · 계정 관리 목록에서 **두 계정에 초록 체크**가 찍히고(세션 계정과
//       activeAccountId 가 각각 "현재 계정" 으로 잡힌다), 둘 다 전환이 막혔다.
//     · 화면에 보이는 계정과 글이 올라가는 계정(그리고 스트리밍 연결)이
//       갈라졌다.
//   전체 로그아웃(저장소를 통째로 비운다)을 해야만 풀리던 것이 이것이다.
//
//   그래서 포인터는 **세션을 기준으로 고쳐 쓰고**, 전역 토큰은 페이지가 들고
//   나온 세션 토큰을 그대로 쓴다.
async function initializeActiveAccountSession(): Promise<void> {
  const sessionAccountId = me ?? null;

  reportUnappliedSwitch(sessionAccountId);

  if (!sessionAccountId) {
    // 로그아웃 상태. 포인터를 남겨 두면 다음 로그인 때 그대로 되살아난다.
    clearActiveAccountIdInStorage();
    return;
  }

  if (getActiveAccountIdFromStorage() !== sessionAccountId) {
    setActiveAccountIdInStorage(sessionAccountId);
  }

  // 평소에는 여기서 끝난다. 페이지의 `meta.access_token` 은 **이 세션의
  // 것임이 보장**되고 `containers/mastodon.jsx` 가 이미 깔아 두었다. 저장된
  // 장기 토큰을 굳이 다시 깔면 부팅마다 verify_credentials 가 한 번씩 더 붙고,
  // 그 토큰의 주인이 이 계정이 아닐 때 화면과 요청이 갈라진다.
  if (getAccessToken()) {
    return;
  }

  // 페이지에 토큰이 없는 예외 상황에서만 저장된 토큰으로 버틴다.
  try {
    const encryptedPayload = await loadEncryptedToken(sessionAccountId);

    if (!encryptedPayload) {
      return;
    }

    const token = await decryptToken(encryptedPayload);

    // 저장된 토큰이 **정말 이 계정의 것인지** 확인한 뒤에만 쓴다.
    const response = await api().get<ApiAccountJSON>(
      '/api/v1/accounts/verify_credentials',
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
      },
    );

    if (response.data.id !== sessionAccountId) {
      // 다른 계정의 토큰이 이 계정 자리에 저장돼 있다.
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
