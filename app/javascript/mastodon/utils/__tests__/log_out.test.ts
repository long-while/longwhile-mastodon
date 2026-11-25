import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogOutError, logOut } from '../log_out';

const del = vi.fn();
const collectStoredTokens = vi.fn();
const revokeTokens = vi.fn();
const clearAllAccounts = vi.fn();
const resetCryptoKey = vi.fn();
const clearDrafts = vi.fn();
const clearActiveAccountIdInStorage = vi.fn();

vi.mock('mastodon/api', () => ({
  default: () => ({ delete: (...args: unknown[]) => del(...args) as unknown }),
}));

vi.mock('mastodon/actions/multi_account', () => ({
  collectStoredTokens: () => collectStoredTokens() as unknown,
  revokeTokens: (tokens: string[]) => revokeTokens(tokens) as unknown,
}));

vi.mock('mastodon/utils/multi_account_db', () => ({
  clearAllAccounts: () => clearAllAccounts() as unknown,
}));

vi.mock('mastodon/utils/multi_account_crypto', () => ({
  resetCryptoKey: () => resetCryptoKey() as unknown,
}));

vi.mock('mastodon/features/messages/util/drafts', () => ({
  clearDrafts: () => clearDrafts() as unknown,
}));

vi.mock('mastodon/utils/multi_account_storage', () => ({
  clearActiveAccountIdInStorage: () =>
    clearActiveAccountIdInStorage() as unknown,
}));

const signedOut = { status: 200, data: { redirect_to: '/auth/sign_in' } };

describe('logOut', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '/' },
    });
    del.mockResolvedValue(signedOut);
    collectStoredTokens.mockResolvedValue(['token-A']);
    revokeTokens.mockResolvedValue(undefined);
    clearAllAccounts.mockResolvedValue(undefined);
    resetCryptoKey.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('keeps the saved accounts on a normal log out', async () => {
    await logOut();

    expect(clearDrafts).toHaveBeenCalled();
    expect(clearActiveAccountIdInStorage).toHaveBeenCalled();
    expect(collectStoredTokens).not.toHaveBeenCalled();
    expect(revokeTokens).not.toHaveBeenCalled();
    expect(clearAllAccounts).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(
      '/auth/sign_out',
      expect.objectContaining({ params: undefined }),
    );
    expect(window.location.href).toBe('/auth/sign_in');
  });

  it('signs out first and forgets the saved accounts only afterwards', async () => {
    const order: string[] = [];
    collectStoredTokens.mockImplementation(() => {
      order.push('collect');
      return Promise.resolve(['token-A']);
    });
    del.mockImplementation(() => {
      order.push('sign_out');
      return Promise.resolve(signedOut);
    });
    revokeTokens.mockImplementation((tokens: string[]) => {
      order.push(`revoke:${tokens.join(',')}`);
      return Promise.resolve();
    });
    clearAllAccounts.mockImplementation(() => {
      order.push('clear');
      return Promise.resolve();
    });
    resetCryptoKey.mockImplementation(() => {
      order.push('key');
      return Promise.resolve();
    });

    await logOut({ forgetSavedAccounts: true });

    expect(order).toEqual([
      'collect',
      'sign_out',
      'revoke:token-A',
      'clear',
      'key',
    ]);
    expect(del).toHaveBeenCalledWith(
      '/auth/sign_out',
      expect.objectContaining({ params: { forget_device: '1' } }),
    );
  });

  it('wipes nothing and rejects when the sign out fails', async () => {
    del.mockRejectedValue(new Error('offline'));

    await expect(logOut({ forgetSavedAccounts: true })).rejects.toBeInstanceOf(
      LogOutError,
    );

    expect(revokeTokens).not.toHaveBeenCalled();
    expect(clearAllAccounts).not.toHaveBeenCalled();
    expect(resetCryptoKey).not.toHaveBeenCalled();
    expect(clearDrafts).not.toHaveBeenCalled();
    expect(clearActiveAccountIdInStorage).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/');
  });

  it('treats a response without a redirect as a failure', async () => {
    del.mockResolvedValue({ status: 200, data: {} });

    await expect(logOut()).rejects.toBeInstanceOf(LogOutError);
    expect(clearDrafts).not.toHaveBeenCalled();
  });

  it('still redirects when forgetting the saved accounts fails after sign out', async () => {
    revokeTokens.mockRejectedValue(new Error('offline'));

    await logOut({ forgetSavedAccounts: true });

    expect(window.location.href).toBe('/auth/sign_in');
  });

  it('still signs out when the saved tokens cannot be read', async () => {
    collectStoredTokens.mockRejectedValue(new Error('idb'));

    await logOut({ forgetSavedAccounts: true });

    expect(del).toHaveBeenCalled();
    expect(revokeTokens).toHaveBeenCalledWith([]);
  });
});
