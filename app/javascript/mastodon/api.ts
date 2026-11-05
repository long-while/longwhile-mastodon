import type {
  AxiosError,
  AxiosResponse,
  Method,
  RawAxiosRequestHeaders,
} from 'axios';
import axios from 'axios';
import LinkHeader from 'http-link-header';

import { getAccessToken } from './initial_state';
import ready from './ready';

export const getLinks = (response: AxiosResponse) => {
  const value = response.headers.link as string | undefined;

  if (!value) {
    return new LinkHeader();
  }

  return LinkHeader.parse(value);
};

const csrfHeader: RawAxiosRequestHeaders = {};

const setCSRFHeader = () => {
  const csrfToken = document.querySelector<HTMLMetaElement>(
    'meta[name=csrf-token]',
  );

  if (csrfToken?.content) {
    csrfHeader['X-CSRF-Token'] = csrfToken.content;
  }
};

export const updateCSRFToken = (token: string) => {
  csrfHeader['X-CSRF-Token'] = token;
  let meta = document.querySelector<HTMLMetaElement>('meta[name=csrf-token]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
  }
  meta.content = token;
};

void ready(setCSRFHeader);

let activeAccountToken: string | null = null;

export const setActiveAccountToken = (token: string | null) => {
  activeAccountToken = token;
};

export const currentAuthorizationToken = () =>
  activeAccountToken ?? getAccessToken() ?? null;

const authorizationTokenFromInitialState = (
  fallback = true,
): RawAxiosRequestHeaders => {
  if (activeAccountToken && activeAccountToken.length > 0) {
    return {
      Authorization: `Bearer ${activeAccountToken}`,
    };
  }

  if (!fallback) {
    return {};
  }

  const accessToken = getAccessToken();

  if (!accessToken) return {};

  return {
    Authorization: `Bearer ${accessToken}`,
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Zombie-session recovery
//
// When the per-session OAuth token embedded in the page (meta.access_token)
// has been revoked or expired server-side while the document still renders as
// "logged in", every authenticated request returns 401 and the UI would
// otherwise spin forever. A plain reload cannot help: `current_session.token`
// is fixed per session activation, so the server re-injects the same dead
// token — only a fresh login mints a new one.
//
// On the first authenticated 401 we route through /auth/sign_out (DELETE) so
// the service worker's existing cleanup wipes the cached '/' shell and the
// 'mastodon' IndexedDB, then land on a clean sign-in page.
// ─────────────────────────────────────────────────────────────────────────

const SESSION_RECOVERY_FLAG = 'mastodon_session_recovery';

let sessionRecoveryInProgress = false;
let sessionRecoveryFlagActive = (() => {
  try {
    return sessionStorage.getItem(SESSION_RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
})();

const clearSessionRecoveryFlag = () => {
  if (!sessionRecoveryFlagActive) return;

  sessionRecoveryFlagActive = false;
  try {
    sessionStorage.removeItem(SESSION_RECOVERY_FLAG);
  } catch {
    // sessionStorage unavailable — nothing to clear
  }
};

// Zombie-session recovery must only fire for the page's OWN session token
// (meta.access_token). Multi-account switching temporarily sends a *different*
// bearer (the switched account's token) via setActiveAccountToken(); a 401 on
// that token only means the stored/switched account is stale. That case is
// handled locally by the switch flow and the boot initializer — signing the
// user out of their working session there caused an endless sign-out loop.
const requestUsedSessionToken = (config: AxiosError['config']): boolean => {
  const authorization = (config?.headers as Record<string, unknown> | undefined)
    ?.Authorization;
  const sessionToken = getAccessToken();

  return (
    typeof authorization === 'string' &&
    typeof sessionToken === 'string' &&
    sessionToken.length > 0 &&
    authorization === `Bearer ${sessionToken}`
  );
};

// @_longwhile — **계정 추가 팝업이 떠 있는 동안에는 복구하지 않는다.**
//   팝업의 `prompt=login` 이 부르는 `sign_out(:user)` 은 세션 쿠키를 같이 쓰는
//   이 탭까지 로그아웃시키고, `before_logout` 이 이 페이지의 세션 토큰도
//   폐기한다. 그 뒤 스트리밍이 끊겨 폴링으로 넘어가면 첫 401 에서 여기로 와
//   `DELETE /auth/sign_out` 을 쏘고 로그인 화면("Signed out successfully.")으로
//   가 버렸다. 팝업은 사라진 opener 에 결과를 보내고, 닫으라는 답을 영영 못
//   받는다. `main.tsx` 는 부팅할 때마다 페이지 세션 토큰을 bearer 로 쓰므로
//   (저장된 전환 토큰은 전환하는 순간에만 깔린다) **계정을 몇 개 추가했든
//   매번** 걸린다.
//
//   그 401 은 예정된 것이다. 흐름이 끝나면 `handleAddAccount` 가 새로고침으로
//   화면을 세션에 맞춘다.
let sessionRecoverySuspensions = 0;

export const suspendSessionRecovery = (): (() => void) => {
  sessionRecoverySuspensions += 1;

  let released = false;

  return () => {
    if (released) return;

    released = true;
    sessionRecoverySuspensions -= 1;
  };
};

const recoverFromInvalidSession = () => {
  if (sessionRecoverySuspensions > 0) return;
  if (sessionRecoveryInProgress) return;
  sessionRecoveryInProgress = true;

  // Loop guard: if we already bounced once this tab session and are still
  // unauthorized, stop rather than redirect forever.
  if (sessionRecoveryFlagActive) {
    sessionRecoveryInProgress = false;
    return;
  }

  sessionRecoveryFlagActive = true;
  try {
    sessionStorage.setItem(SESSION_RECOVERY_FLAG, '1');
  } catch {
    // sessionStorage unavailable — proceed with the redirect anyway
  }

  const redirectToSignIn = () => {
    window.location.href = '/auth/sign_in';
  };

  const headers: Record<string, string> = {};
  const csrfToken = csrfHeader['X-CSRF-Token'];
  if (typeof csrfToken === 'string') {
    headers['X-CSRF-Token'] = csrfToken;
  }

  // DELETE matches the regular logout flow and is what the service worker
  // intercepts to clear its caches; we redirect regardless of the outcome.
  void fetch('/auth/sign_out', {
    method: 'DELETE',
    credentials: 'include',
    headers,
    redirect: 'manual',
  })
    .catch(() => undefined)
    .finally(redirectToSignIn);
};

// eslint-disable-next-line import/no-default-export
export default function api(withAuthorization = true) {
  const instance = axios.create({
    transitional: {
      clarifyTimeoutError: true,
    },
    headers: {
      ...csrfHeader,
      ...(withAuthorization ? authorizationTokenFromInitialState() : {}),
    },

    transformResponse: [
      function (data: unknown) {
        try {
          return JSON.parse(data as string) as unknown;
        } catch {
          return data;
        }
      },
    ],
  });

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      if (response.headers.deprecation) {
        console.warn(
          `Deprecated request: ${response.config.method} ${response.config.url}`,
        );
      }

      // A healthy authenticated response means the session is valid again;
      // reset the recovery guard so a future genuine expiry can recover.
      clearSessionRecoveryFlag();
      return response;
    },
    (error: AxiosError) => {
      // A 401 on a request that carried our bearer token means the session
      // token is dead. Recover instead of spinning forever.
      if (
        error.response?.status === 401 &&
        requestUsedSessionToken(error.config)
      ) {
        recoverFromInvalidSession();
      }

      return Promise.reject(error);
    },
  );

  return instance;
}

type ApiUrl = `v${1 | 2}/${string}`;
type RequestParamsOrData = Record<string, unknown>;

export async function apiRequest<ApiResponse = unknown>(
  method: Method,
  url: string,
  args: {
    signal?: AbortSignal;
    params?: RequestParamsOrData;
    data?: RequestParamsOrData;
    timeout?: number;
  } = {},
) {
  const { data } = await api().request<ApiResponse>({
    method,
    url: '/api/' + url,
    ...args,
  });

  return data;
}

export async function apiRequestGet<ApiResponse = unknown>(
  url: ApiUrl,
  params?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('GET', url, { params });
}

export async function apiRequestPost<ApiResponse = unknown>(
  url: ApiUrl,
  data?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('POST', url, { data });
}

export async function apiRequestPut<ApiResponse = unknown>(
  url: ApiUrl,
  data?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('PUT', url, { data });
}

export async function apiRequestDelete<ApiResponse = unknown>(
  url: ApiUrl,
  params?: RequestParamsOrData,
) {
  return apiRequest<ApiResponse>('DELETE', url, { params });
}
