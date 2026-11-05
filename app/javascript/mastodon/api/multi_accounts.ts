import api from 'mastodon/api';

// 타임아웃 상수는 의존성 없는 별도 모듈에서 가져와 re-export 한다. 이 모듈은
// 동적 import 전용(lazy chunk)이므로, 상수를 정적 import 하는 쪽이 이 모듈을
// 직접 정적 import 하면 코드 분할이 깨진다. 정적 import 는 constants 파일을 쓸 것.
export { MULTI_ACCOUNT_REQUEST_TIMEOUT } from './multi_accounts_constants';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from './multi_accounts_constants';

interface AuthorizeEntryResponse {
  authorize_url: string;
  state: string;
  nonce: string;
}

interface FetchAuthorizeEntryOptions {
  forceLogin?: boolean;
}

interface ConsumePayload {
  state: string;
  nonce: string;
  authorization_code: string;
}

interface ConsumeResponse {
  token: string;
  account: {
    id: string;
    acct: string;
    username: string;
    display_name: string;
    avatar: string;
    avatar_static: string;
  };
  scope: string;
  expires_at: string | null;
  state: string;
  nonce: string;
}

export const fetchAuthorizeEntry = async (
  options: FetchAuthorizeEntryOptions = {},
): Promise<AuthorizeEntryResponse> => {
  const { forceLogin } = options;
  const response = await api().get<AuthorizeEntryResponse>('/multi_accounts/entry', {
    params: {
      force_login: typeof forceLogin === 'boolean' ? forceLogin : undefined,
    },
    timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
  });
  return response.data;
};

export const consumeAuthorizationCode = async (
  payload: ConsumePayload,
): Promise<ConsumeResponse> => {
  try {
    const url = '/api/v1/multi_accounts/consume';
    
    // consume 엔드포인트는 state/nonce로 검증하므로 Authorization 헤더 없이 호출한다.
    const response = await api(false).post<ConsumeResponse>(
      url,
      { payload },
      { timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT },
    );
    return response.data;
  } catch (error: any) {
    console.error('consumeAuthorizationCode error:', {
      url: error?.config?.url,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      error: error,
    });
    
    // Handle API errors with better messages
    if (error?.response?.status === 401) {
      const errorMessage = error?.response?.data?.error || '인증에 실패했습니다. 다시 시도해주세요.';
      throw new Error(errorMessage);
    } else if (error?.response?.status === 400) {
      const errorMessage = error?.response?.data?.error || '잘못된 요청입니다.';
      throw new Error(errorMessage);
    } else if (error?.response?.status === 404) {
      const errorMessage = error?.response?.data?.error || `API 엔드포인트를 찾을 수 없습니다. (${error?.config?.url})`;
      throw new Error(errorMessage);
    } else if (error?.response?.status === 422) {
      const errorMessage = error?.response?.data?.error || '요청을 처리할 수 없습니다.';
      throw new Error(errorMessage);
    } else if (error?.response) {
      const errorMessage = error?.response?.data?.error || `서버 오류가 발생했습니다 (${error.response.status})`;
      throw new Error(errorMessage);
    } else {
      throw new Error(error?.message || '계정 추가 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.');
    }
  }
};

interface RestorePayload {
  state: string;
  nonce: string;
}

export const restoreMultiAccountSession = async (
  payload: RestorePayload,
): Promise<void> => {
  await api(false).post('/multi_accounts/session/restore', { payload }, {
    timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
  });
};

export interface RefreshSessionResponse {
  token: string;
  account: {
    id: string;
    acct: string;
    username: string;
    display_name: string;
    avatar: string;
    avatar_static: string;
  };
  scope: string;
  expires_at: string | null;
}

// `/api/v1/multi_accounts/refresh_token` 과 `session/refresh` 는 같은 모양을 돌려준다.
export type MintedSwitchToken = RefreshSessionResponse;

// 계정 전환에 쓸 수 있는 **장기 토큰**을 새로 발급받는다.
//
// @_longwhile — 페이지의 세션 토큰(`meta.access_token`)은 `SessionActivation` 이
//   **웹 superapp** 으로 만든 것이라 `long_lived`·`purpose`·`multi_account` 가
//   모두 비어 있다. `MultiAccounts::RefreshService#ensure_refresh_token_valid!` 가
//   그런 토큰을 **422** 로 막으므로, 그걸 저장해 두면 나중에 그 계정으로 전환할
//   때마다 "저장된 계정 토큰이 만료되었거나 사용할 수 없습니다" 가 뜬다 — 토큰이
//   죽은 게 아니라 **종류가 틀린** 것이다. 전환에 쓸 수 있는 토큰을 만드는 곳은
//   이 엔드포인트뿐이다.
//
// 서버는 **지금 깔려 있는 bearer 의 주인**에게 토큰을 내준다. 그게
// `expectedAccountId` 가 아니면 남의 토큰이므로 `null` 을 돌려 버린다 — 그대로
// 적으면 그 항목을 누를 때마다 남의 세션으로 로그인된다. HTTP 오류는 던진다.
export const mintSwitchToken = async (
  expectedAccountId: string,
): Promise<MintedSwitchToken | null> => {
  const response = await api().post<MintedSwitchToken>(
    '/api/v1/multi_accounts/refresh_token',
    undefined,
    { timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT },
  );

  const { token, account } = response.data;

  if (!token || !account.id) {
    console.error('[MultiAccount] refresh_token returned no usable token.');
    return null;
  }

  if (account.id !== expectedAccountId) {
    console.error(
      `[MultiAccount] refresh_token returned a token for ${account.id}, expected ${expectedAccountId}; discarding it.`,
    );
    return null;
  }

  return response.data;
};

export const refreshSession = async (refreshToken: string) => {
  return api(false).post<RefreshSessionResponse>(
    '/api/v1/multi_accounts/session/refresh',
    {
      refresh_token: refreshToken,
    },
    {
      headers: {
        Accept: 'application/json',
      },
      timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
    },
  );
};

