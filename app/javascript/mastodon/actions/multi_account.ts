import type { AppDispatch, GetState } from '../store';
import type { ApiAccountJSON } from '../api_types/accounts';
import type { EncryptedPayload, MultiAccountEntry } from '../types/multi_account';
import api, { setActiveAccountToken, updateCSRFToken } from '../api';
import {
  deleteEncryptedToken,
  loadEncryptedToken,
  saveEncryptedToken,
  loadAllEntries,
} from '../utils/multi_account_db';
import { decryptToken, encryptToken, resetCryptoKey } from '../utils/multi_account_crypto';
import { importFetchedAccount } from './importer';
import SwitchLogger from '../utils/switch_logger';
import {
  clearActiveAccountIdIfMatches,
  getActiveAccountIdFromStorage,
  setActiveAccountIdInStorage,
} from '../utils/multi_account_storage';

const refreshOAuthToken = async (
  dispatch: AppDispatch,
  entry: MultiAccountEntry,
): Promise<string> => {
  const { fetchAuthorizeEntry, consumeAuthorizationCode } = await import(
    '../api/multi_accounts'
  );
  const {
    openOAuthPopup,
    restoreMultiAccountSession,
  } = await import('../features/multi_account/callback_handler');

  const pending = { state: null as string | null, nonce: null as string | null };

  try {
    const authorizeEntry = await fetchAuthorizeEntry({ forceLogin: false });
    pending.state = authorizeEntry.state;
    pending.nonce = authorizeEntry.nonce;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    (window as any).__MA_OAUTH_POPUP_OPEN__ = true;
    const blankPopup = window.open(
      'about:blank',
      'multi-account-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`,
    );

    if (!blankPopup) {
      (window as any).__MA_OAUTH_POPUP_OPEN__ = false;
      throw new Error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.');
    }

    const { authorize_url, state, nonce } = authorizeEntry;
    const callback = await openOAuthPopup(authorize_url, state, blankPopup);
    (window as any).__MA_OAUTH_POPUP_OPEN__ = false;

    const { token, account } = await consumeAuthorizationCode({
      state: callback.state,
      nonce,
      authorization_code: callback.code,
    });

    const refreshedEntry: MultiAccountEntry = {
      ...entry,
      id: account.id ?? entry.id,
      acct: account.acct ?? entry.acct,
      displayName:
        account.display_name ?? account.username ?? entry.displayName,
      avatar: account.avatar ?? account.avatar_static ?? entry.avatar,
      encryptedTokenRef: entry.encryptedTokenRef,
      lastUsedAt: new Date().toISOString(),
    };

    await dispatch(registerAccount(refreshedEntry, token) as unknown as any);
    return token;
  } catch (error) {
    (window as any).__MA_OAUTH_POPUP_OPEN__ = false;
    if (pending.state && pending.nonce) {
      try {
        await restoreMultiAccountSession({
          state: pending.state,
          nonce: pending.nonce,
        });
      } catch (restoreError) {
        console.error(
          'Failed to restore multi-account session after token refresh failure:',
          restoreError,
        );
      }
    }

    throw error;
  }
};

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
export const MULTI_ACCOUNT_SET_ACTIVE_ACCOUNT_META =
  'MULTI_ACCOUNT_SET_ACTIVE_ACCOUNT_META';

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

export const setActiveAccountMeta = (accountId: string) => ({
  type: MULTI_ACCOUNT_SET_ACTIVE_ACCOUNT_META,
  payload: { accountId },
});

// Thunks
export const hydrateMultiAccount =
  () => async (dispatch: AppDispatch, getState: GetState) => {
    try {
      const storedEntries = await loadAllEntries();
      const entryIds = Object.keys(storedEntries);

      const state: any = getState();
      const hasGetIn = typeof state?.getIn === 'function';
      const existingActive = hasGetIn
        ? state.getIn(['multiAccount', 'activeAccountId'])
        : state?.multiAccount?.activeAccountId ?? null;
      const storedActiveId = getActiveAccountIdFromStorage();

      let activeAccountId: string | null = null;

      if (storedActiveId && entryIds.includes(storedActiveId)) {
        activeAccountId = storedActiveId;
      } else {
        if (storedActiveId) {
          clearActiveAccountIdIfMatches(storedActiveId);
        }

      if (existingActive && entryIds.includes(existingActive)) {
        activeAccountId = existingActive;
      } else if (entryIds.length > 0) {
        activeAccountId = entryIds
          .map((id) => storedEntries[id])
          .filter((entry) => entry?.lastUsedAt)
          .sort(
            (a, b) =>
              new Date(b.lastUsedAt ?? 0).getTime() -
              new Date(a.lastUsedAt ?? 0).getTime(),
          )[0]?.id ?? entryIds[0];
        }
      }

      dispatch(
        hydrateMultiAccountAction({
          activeAccountId,
          accounts: storedEntries,
        }),
      );
    } catch (error) {
      console.error('Failed to hydrate multi-account state:', error);
    }
  };

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
        throw new Error(`Account ${accountId} not found`);
      }

      const { refreshSession } = await import('../api/multi_accounts');

      const encryptedPayload = await loadEncryptedToken(accountId);
      if (!encryptedPayload) {
        throw new Error(
          '저장된 토큰을 찾을 수 없습니다. 계정을 다시 추가해주세요.',
        );
      }

      let refreshToken: string;
      try {
        refreshToken = await decryptToken(encryptedPayload);
      } catch (decryptError) {
        console.error(
          `Failed to decrypt refresh token for account ${accountId}, attempting key reset:`,
          decryptError,
        );
        SwitchLogger.logSwitchFailure(
          accountId,
          'failed_to_decrypt_refresh_token',
          startTime,
        );

        try {
          await resetCryptoKey();
          refreshToken = await decryptToken(encryptedPayload);
        } catch (retryError) {
          console.error(
            `Retry decrypt after key reset failed for account ${accountId}:`,
            retryError,
          );
          throw new Error(
            '저장된 계정 토큰을 복호화할 수 없습니다. 계정을 다시 추가해주세요.',
          );
        }
      }

      try {
        document.cookie.split(';').forEach((cookie) => {
          const trimmed = cookie.replace(/^ +/, '');
          const eqPos = trimmed.indexOf('=');
          const name = eqPos > -1 ? trimmed.substring(0, eqPos) : trimmed;
          document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`;
        });
      } catch (cookieError) {
        console.warn('[Switch] Failed to clear cookies:', cookieError);
      }

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
        const status = (refreshError as any)?.response?.status;
        console.warn(
          `Failed to refresh session for account ${accountId}:`,
          refreshError,
        );

        if (status && [400, 401, 403, 422].includes(status)) {
          throw new Error(
            '저장된 계정 토큰이 만료되었거나 사용할 수 없습니다. 계정을 다시 로그인하여 추가해주세요.',
          );
        }

        throw refreshError;
      }
      })();

      const sessionToken = refreshResponse?.data?.token as string | undefined;

      if (!sessionToken) {
        throw new Error('세션 토큰을 발급받지 못했습니다.');
      }

      setActiveAccountToken(sessionToken);

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

        dispatch(registerAccountAction(normalizedEntry));

        if (currentEncryptedPayload) {
          try {
            await saveEncryptedToken(
              accountId,
              currentEncryptedPayload,
              normalizedEntry,
            );
          } catch (saveError) {
            console.error(
              `Failed to update stored metadata for account ${accountId}:`,
              saveError,
            );
          }
        }
      };

      const verifiedAccount = await (async () => {
        try {
          const response = await api().get('/api/v1/accounts/verify_credentials');
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

      setActiveAccountIdInStorage(accountId);
      SwitchLogger.logSwitchSuccess(accountId, startTime);

      if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
        window.location.reload();
      }

      return sessionToken;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      SwitchLogger.logSwitchFailure(accountId, errorMessage, startTime);
      console.error('Failed to switch account:', error);
      console.error('[Switch] FAILED:', error);
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
