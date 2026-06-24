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

