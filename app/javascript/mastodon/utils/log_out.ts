import {
  collectStoredTokens,
  revokeTokens,
} from 'mastodon/actions/multi_account';
import api from 'mastodon/api';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from 'mastodon/api/multi_accounts_constants';
import { clearDrafts } from 'mastodon/features/messages/util/drafts';
import { resetCryptoKey } from 'mastodon/utils/multi_account_crypto';
import { clearAllAccounts } from 'mastodon/utils/multi_account_db';
import { clearActiveAccountIdInStorage } from 'mastodon/utils/multi_account_storage';

interface LogOutOptions {
  forgetSavedAccounts?: boolean;
}

export class LogOutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LogOutError';
  }
}

const collectTokensToRevoke = async (): Promise<string[]> => {
  try {
    return await collectStoredTokens();
  } catch (error) {
    console.warn('[MultiAccount] Could not read the saved accounts:', error);
    return [];
  }
};

const forgetSavedAccountsOnThisDevice = async (tokens: string[]) => {
  try {
    await revokeTokens(tokens);
    await clearAllAccounts();
    await resetCryptoKey();
  } catch (error) {
    console.warn('[MultiAccount] Could not forget the saved accounts:', error);
  }
};

const requestSignOut = async (forgetDevice: boolean): Promise<string> => {
  let response;

  try {
    response = await api(false).delete<{ redirect_to?: string }>(
      '/auth/sign_out',
      {
        headers: { Accept: 'application/json' },
        params: forgetDevice ? { forget_device: '1' } : undefined,
        withCredentials: true,
        timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
      },
    );
  } catch (error) {
    console.error('Failed to log out, response was an error', error);
    throw new LogOutError('Failed to log out', { cause: error });
  }

  const redirectTo = response.data.redirect_to;

  if (response.status !== 200 || !redirectTo) {
    console.error(
      'Failed to log out, got an unexpected non-redirect response from the server',
      response,
    );
    throw new LogOutError('Unexpected log out response');
  }

  return redirectTo;
};

export async function logOut({
  forgetSavedAccounts = false,
}: LogOutOptions = {}): Promise<void> {
  const tokens = forgetSavedAccounts ? await collectTokensToRevoke() : [];

  const redirectTo = await requestSignOut(forgetSavedAccounts);

  clearDrafts();

  clearActiveAccountIdInStorage();

  if (forgetSavedAccounts) {
    await forgetSavedAccountsOnThisDevice(tokens);
  }

  window.location.href = redirectTo;
}
