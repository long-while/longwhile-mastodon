import type { AppDispatch, GetState } from '../store';
import type { ApiAccountJSON } from '../api_types/accounts';
import type { EncryptedPayload, MultiAccountEntry } from '../types/multi_account';
import {
  MultiAccountSwitchError,
  SwitchErrorCode,
} from '../types/multi_account';
import api, { setActiveAccountToken, updateCSRFToken } from '../api';
import {
  deleteEncryptedToken,
  loadEncryptedToken,
  saveEncryptedToken,
} from '../utils/multi_account_db';
import { decryptToken, encryptToken } from '../utils/multi_account_crypto';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from '../api/multi_accounts_constants';
import { importFetchedAccount } from './importer';
import SwitchLogger from '../utils/switch_logger';
import {
  clearActiveAccountIdIfMatches,
  markSwitchIntent,
  setActiveAccountIdInStorage,
} from '../utils/multi_account_storage';

type CsrfInfo = {
  csrfToken: string;
  formToken?: string;
};

const readInitialCsrfInfo = (): CsrfInfo | null => {
  const csrfToken = document
    .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    ?.getAttribute('content')
    ?.trim();

  if (!csrfToken) {
    return null;
  }

  return {
    csrfToken,
    formToken: undefined,
  };
};

let cachedCsrfInfo: CsrfInfo | null = readInitialCsrfInfo();

const setCachedCsrfInfo = (info: CsrfInfo) => {
  cachedCsrfInfo = info;
  updateCSRFToken(info.csrfToken);
};

// Action types
export const MULTI_ACCOUNT_HYDRATE = 'MULTI_ACCOUNT_HYDRATE';
export const MULTI_ACCOUNT_REGISTER = 'MULTI_ACCOUNT_REGISTER';
export const MULTI_ACCOUNT_SWITCH = 'MULTI_ACCOUNT_SWITCH';
export const MULTI_ACCOUNT_REMOVE = 'MULTI_ACCOUNT_REMOVE';
export const MULTI_ACCOUNT_TOUCH = 'MULTI_ACCOUNT_TOUCH';

// Action creators
export const hydrateMultiAccountAction = (payload: {
  activeAccountId: string | null;
  accounts: Record<string, MultiAccountEntry>;
}) => ({
  type: MULTI_ACCOUNT_HYDRATE,
  payload,
});

export const registerAccountAction = (payload: MultiAccountEntry) => ({
  type: MULTI_ACCOUNT_REGISTER,
  payload,
});

export const switchAccountAction = (accountId: string) => ({
  type: MULTI_ACCOUNT_SWITCH,
  payload: { accountId },
});

export const removeAccountAction = (accountId: string) => ({
  type: MULTI_ACCOUNT_REMOVE,
  payload: { accountId },
});

export const touchAccountAction = (accountId: string) => ({
  type: MULTI_ACCOUNT_TOUCH,
  payload: { accountId },
});

// Thunks
export const registerAccount =
  (entry: MultiAccountEntry, token: string) =>
  async (dispatch: AppDispatch) => {
    try {
      const lastUsedAt = new Date().toISOString();
      const entryWithTimestamp = {
        ...entry,
        lastUsedAt,
      };

      // Encrypt and save the token
      const encryptedPayload = await encryptToken(token);
      await saveEncryptedToken(entry.id, encryptedPayload, entryWithTimestamp);

      // Register the account in Redux
      dispatch(registerAccountAction(entryWithTimestamp));
    } catch (error) {
      console.error('Failed to register account:', error);
      throw error;
    }
  };

export const switchAccount =
  (accountId: string) => async (dispatch: AppDispatch, getState: GetState) => {
    const startTime = SwitchLogger.logSwitchAttempt(accountId);
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`multi_account_switch_start_${accountId}`);
    }

    // 서버 세션이 실제로 바뀐 뒤인지. 바뀐 뒤의 실패는 조용히 끝낼 수 없다.
    let sessionSwitched = false;

    const reloadToMatchSession = () => {
      if (
        typeof window !== 'undefined' &&
        typeof window.location !== 'undefined'
      ) {
        window.location.reload();
      }
    };

    try {
      const state: any = getState();
      const hasGetIn = typeof state?.getIn === 'function';
      const accountsSource = hasGetIn
        ? state.getIn(['multiAccount', 'accounts'])
        : state?.multiAccount?.accounts ?? null;
      const accountExists =
        !!accountsSource &&
        (typeof accountsSource?.has === 'function'
          ? accountsSource.has(accountId)
          : Object.prototype.hasOwnProperty.call(accountsSource, accountId));

      if (!accountExists) {
        throw new MultiAccountSwitchError(
          SwitchErrorCode.ACCOUNT_NOT_FOUND,
          `Account ${accountId} not found`,
        );
      }

      const { refreshSession } = await import('../api/multi_accounts');

      const encryptedPayload = await loadEncryptedToken(accountId);
      if (!encryptedPayload) {
        throw new MultiAccountSwitchError(
          SwitchErrorCode.TOKEN_MISSING,
          '저장된 토큰을 찾을 수 없습니다. 계정을 다시 추가해주세요.',
        );
      }

      let refreshToken: string;
      try {
        refreshToken = await decryptToken(encryptedPayload);
      } catch (decryptError) {
        // NOTE: 절대로 여기서 resetCryptoKey()를 호출하면 안 된다.
        // 마스터 키를 삭제하면 이 계정뿐 아니라 저장된 '모든' 계정의 토큰이
        // 영구적으로 복호화 불능이 되며, 재시도는 새 키로 옛 암호문을 풀 수 없어 무의미하다.
        // 대신 이 계정의 토큰만 죽은 것으로 간주하고 구조화된 에러로 표면화한다.
        console.error(
          `Failed to decrypt refresh token for account ${accountId}:`,
          decryptError,
        );
        // 여기서 `logSwitchFailure` 를 부르지 않는다 — 아래 바깥 catch 가 반드시
        // 한 번 남긴다. 둘 다 부르면 서버 로그와 Sentry 에 같은 실패가 두 번 쌓인다.
        throw new MultiAccountSwitchError(
          SwitchErrorCode.TOKEN_INVALID,
          '저장된 계정 토큰을 복호화할 수 없습니다. 계정을 다시 추가해주세요.',
        );
      }

      // @_longwhile — **여기서 쿠키를 지우지 않는다.** 예전에는 refresh 를
      //   부르기 전에 `document.cookie` 를 통째로 비웠는데, 서버가 `reset_session` +
      //   `sign_in` 으로 새 세션 쿠키를 어차피 내려주므로 얻는 것은 없고,
      //   **refresh 가 실패하면 이 탭은 세션 쿠키가 통째로 없는 상태로 남았다.**
      //   화면은 옛 계정을 그리고 있는데 서버는 로그아웃 상태라, 새로고침하면
      //   로그인 화면이 뜨고 그 뒤 로그아웃을 누르면 Devise 가 `already_signed_out`
      //   ("Signed out successfully.")를 띄운다. 422 한 번에 계정이 날아가는 것처럼
      //   보이던 게 이것이다. 남은 쿠키는 서버가 정리한다.

      const entryRecord =
        typeof accountsSource?.get === 'function'
          ? accountsSource.get(accountId)
          : accountsSource?.[accountId];
      const entry: MultiAccountEntry | null = entryRecord
        ? entryRecord.toJS
          ? entryRecord.toJS()
          : entryRecord
        : null;

      let currentEncryptedPayload: EncryptedPayload | null = encryptedPayload;

      const refreshResponse = await (async () => {
        try {
          const response = await refreshSession(refreshToken);
          const csrfHeader =
            response.headers?.['x-csrf-token'] ??
            (response.headers?.['X-CSRF-Token'] as string | undefined);
          if (typeof csrfHeader === 'string' && csrfHeader.trim().length > 0) {
            setCachedCsrfInfo({
              csrfToken: csrfHeader.trim(),
              formToken: undefined,
            });
          }
          return response;
        } catch (refreshError) {
          const status = (refreshError as any)?.response?.status as
            | number
            | undefined;
          const serverMessage = (refreshError as any)?.response?.data?.error as
            | string
            | undefined;

          console.warn(
            `Failed to refresh session for account ${accountId}:`,
            refreshError,
          );

          // @_longwhile — **저장된 토큰이 죽은 경우만 계정을 다시 추가하라고 한다.**
          //   401 은 폐기·무효, 422 는 `ensure_refresh_token_valid!` 가 막은 것
          //   (= 다중 계정 토큰이 아니다). 둘 다 다시 눌러도 결과가 같으므로
          //   여기서 죽은 토큰을 **지운다.** 그러지 않으면 같은 오류가 영원히
          //   반복된다 — `ensureAccountStored` 는 이미 토큰이 있으면 손대지 않기
          //   때문이다. 지워 두면 그 계정이 다음에 이 브라우저의 세션이 될 때
          //   쓸 수 있는 토큰으로 저절로 다시 채워진다.
          if (status === 401 || status === 422) {
            try {
              await deleteEncryptedToken(accountId);
            } catch (deleteError) {
              console.error(
                `Failed to drop the dead token for account ${accountId}:`,
                deleteError,
              );
            }

            throw new MultiAccountSwitchError(
              SwitchErrorCode.TOKEN_INVALID,
              '저장된 계정 토큰을 쓸 수 없습니다. 계정을 다시 로그인하여 추가해주세요.',
            );
          }

          // @_longwhile — 나머지는 **토큰 문제가 아니다.** 403 은 기능이 꺼져
          //   있거나(`refresh_flow`) 롤아웃 대상이 아니거나 정지된 계정, 429 는
          //   요청 과다, 404 는 계정이 사라진 경우다. 이걸 "토큰이 만료됐다" 로
          //   묶으면 멀쩡한 항목을 지우라고 권하게 된다.
          //
          //   서버 문구를 그대로 띄우지 않는다 — 영어이고
          //   ("refresh_token is required" 같은) 개발자용 문구가 섞여 있다.
          //   진단에 필요한 것은 위의 `console.warn` 이 이미 남긴다.
          const rejectionMessage = (() => {
            if (status === 429) {
              return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
            }

            if (status === 403) {
              return '지금은 이 계정으로 전환할 수 없습니다. 계정이 정지되었거나 계정 전환이 꺼져 있을 수 있습니다.';
            }

            if (status === 404) {
              return '그 계정을 찾을 수 없습니다. 삭제되었거나 이전되었을 수 있습니다.';
            }

            return '계정 전환에 실패했습니다. 잠시 후 다시 시도해주세요.';
          })();

          // 서버가 뭐라고 했는지는 콘솔에만 남긴다.
          if (serverMessage) {
            console.warn(`[MultiAccount] refresh rejected: ${serverMessage}`);
          }

          throw new MultiAccountSwitchError(
            SwitchErrorCode.REFRESH_REJECTED,
            rejectionMessage,
          );
        }
      })();

      // @_longwhile — **여기서부터 서버 세션은 이미 바뀌었다** (`refresh` 가
      //   `reset_session` + `sign_in` 을 했다). 뒤에서 무슨 일이 나든 이
      //   페이지는 남의 세션을 물고 있는 셈이라, 에러만 던지고 멈추면
      //   화면(옛 계정)과 세션(새 계정)이 갈라진 채로 남는다 — CSRF 토큰도
      //   이미 무효다. 응답에 토큰이 빠져 있어도 마찬가지다.
      sessionSwitched = true;

      const sessionToken = refreshResponse?.data?.token as string | undefined;

      if (!sessionToken) {
        throw new MultiAccountSwitchError(
          SwitchErrorCode.SESSION_TOKEN_MISSING,
          '세션 토큰을 발급받지 못했습니다.',
        );
      }

      setActiveAccountToken(sessionToken);

      // @_longwhile — 저장된 토큰의 **실제 주인**이 기준이다.
      //   키(accountId)와 토큰 주인이 어긋난 기록이 남아 있을 수 있는데,
      //   그대로 두면 이 항목을 누를 때마다 남의 세션을 물고 온다. 아래에서
      //   어긋난 키는 지우고 확인된 id 로 다시 저장한다.
      const updateEntryMetadata = async (
        accountData: ApiAccountJSON | null,
      ): Promise<void> => {
        if (!accountData) {
          return;
        }

        const resolvedId = accountData.id ?? accountId;
        const normalizedEntry: MultiAccountEntry = {
          id: resolvedId,
          acct:
            accountData.acct ??
            accountData.username ??
            entry?.acct ??
            resolvedId,
          displayName:
            accountData.display_name ??
            accountData.username ??
            entry?.displayName ??
            '',
          avatar:
            accountData.avatar ??
            accountData.avatar_static ??
            entry?.avatar ??
            '',
          encryptedTokenRef: entry?.encryptedTokenRef ?? '',
          lastUsedAt: new Date().toISOString(),
        };

        if (resolvedId !== accountId) {
          console.error(
            `[MultiAccount] Stored token for ${accountId} belongs to ${resolvedId}; repairing the stored entry.`,
          );

          try {
            await deleteEncryptedToken(accountId);
          } catch (deleteError) {
            console.error(
              `Failed to drop the mismatched entry for account ${accountId}:`,
              deleteError,
            );
          }

          dispatch(removeAccountAction(accountId));
          clearActiveAccountIdIfMatches(accountId);
        }

        dispatch(registerAccountAction(normalizedEntry));

        if (currentEncryptedPayload) {
          try {
            await saveEncryptedToken(
              resolvedId,
              currentEncryptedPayload,
              normalizedEntry,
            );
          } catch (saveError) {
            console.error(
              `Failed to update stored metadata for account ${resolvedId}:`,
              saveError,
            );
          }
        }
      };

      const verifiedAccount = await (async () => {
        try {
          const response = await api().get('/api/v1/accounts/verify_credentials', {
            timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
          });
          dispatch(importFetchedAccount(response.data));
          return response.data as ApiAccountJSON;
        } catch (verifyError) {
        const status = (verifyError as any)?.response?.status;
        const errorDescription =
          (verifyError as any)?.response?.data?.error_description ?? '';

        const isInvalidToken =
          status === 401 ||
          (status === 403 &&
            typeof errorDescription === 'string' &&
            errorDescription.toLowerCase().includes('invalid_token'));

        if (isInvalidToken) {
          throw new Error(
            '저장된 계정 토큰이 만료되었거나 사용할 수 없습니다. 계정을 다시 로그인하여 추가해주세요.',
          );
        }

        console.error(
          `Failed to verify credentials for account ${accountId}:`,
          verifyError,
        );
        throw verifyError;
      }
      })();

      await updateEntryMetadata(verifiedAccount);

      // 세션은 이미 서버에서 바뀌었다. 포인터는 **실제로 로그인된 계정**을
      // 가리켜야 한다 — 요청한 계정이 아니라.
      const activatedAccountId = verifiedAccount?.id ?? accountId;

      setActiveAccountIdInStorage(activatedAccountId);
      // @_longwhile — 표식은 **사용자가 누른 계정**으로 남긴다. 새로고침한 뒤
      //   세션이 그 계정이 아니면(쿠키가 안 붙었거나, 저장된 토큰의 주인이
      //   달라 엉뚱한 계정으로 들어갔거나) `main.tsx` 가 알려 준다. 예전에는
      //   화면만 그대로 돌아오고 아무 말이 없어서 "눌러도 아무 일도 일어나지
      //   않는" 것으로 보였다.
      markSwitchIntent(accountId);
      SwitchLogger.logSwitchSuccess(activatedAccountId, startTime);

      reloadToMatchSession();

      return sessionToken;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      SwitchLogger.logSwitchFailure(accountId, errorMessage, startTime);
      console.error('Failed to switch account:', error);

      if (sessionSwitched) {
        // 세션이 이미 바뀐 뒤의 실패다. 사용자가 누른 계정을 표식으로 남기고
        // 새로고침하면, 어디로 들어갔든 화면이 세션과 맞고 다른 계정으로
        // 들어갔을 때는 `main.tsx` 가 알려 준다.
        markSwitchIntent(accountId);
        reloadToMatchSession();
        return null;
      }

      throw error;
    }
  };

export const removeAccount =
  (accountId: string) => async (dispatch: AppDispatch, getState: GetState) => {
    try {
      const state: any = getState();
      const wasActive =
        state?.getIn?.(['multiAccount', 'activeAccountId']) === accountId;

      // Delete the encrypted token
      await deleteEncryptedToken(accountId);

      // Remove from Redux state
      dispatch(removeAccountAction(accountId));

      if (wasActive) {
        setActiveAccountToken(null);
      }

      clearActiveAccountIdIfMatches(accountId);
    } catch (error) {
      console.error('Failed to remove account:', error);
      throw error;
    }
  };
