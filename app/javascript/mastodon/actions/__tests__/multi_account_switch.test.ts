import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MultiAccountSwitchError,
  SwitchErrorCode,
} from '../../types/multi_account';
import { switchAccount } from '../multi_account';

const refreshSession = vi.fn();
const loadEncryptedToken = vi.fn();
const deleteEncryptedToken = vi.fn();
const saveEncryptedToken = vi.fn();
const decryptToken = vi.fn();

vi.mock('../../api/multi_accounts', () => ({
  refreshSession: (token: string) => refreshSession(token) as unknown,
}));

vi.mock('../../utils/multi_account_db', () => ({
  loadEncryptedToken: (id: string) => loadEncryptedToken(id) as unknown,
  deleteEncryptedToken: (id: string) => deleteEncryptedToken(id) as unknown,
  saveEncryptedToken: (...args: unknown[]) =>
    saveEncryptedToken(...args) as unknown,
}));

vi.mock('../../utils/multi_account_crypto', () => ({
  decryptToken: (payload: unknown) => decryptToken(payload) as unknown,
  encryptToken: (token: string) =>
    Promise.resolve({ iv: '', cipherText: token }),
}));

vi.mock('../../api', () => ({
  default: () => ({ get: vi.fn() }),
  setActiveAccountToken: vi.fn(),
  updateCSRFToken: vi.fn(),
}));

vi.mock('../importer', () => ({
  importFetchedAccount: (account: unknown) => ({
    type: 'ACCOUNT_IMPORT',
    payload: account,
  }),
}));

vi.mock('../../utils/switch_logger', () => ({
  default: {
    logSwitchAttempt: vi.fn(() => 0),
    logSwitchSuccess: vi.fn(),
    logSwitchFailure: vi.fn(),
  },
}));

vi.mock('../../utils/multi_account_storage', () => ({
  clearActiveAccountIdIfMatches: vi.fn(),
  markSwitchIntent: vi.fn(),
  setActiveAccountIdInStorage: vi.fn(),
}));

const TARGET = 'B';

const state = {
  multiAccount: {
    accounts: {
      [TARGET]: {
        id: TARGET,
        acct: 'b',
        displayName: 'B',
        avatar: '',
        encryptedTokenRef: '',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  },
};

const httpError = (status: number, error?: string) => ({
  response: { status, data: error ? { error } : {} },
});

const runSwitch = () =>
  switchAccount(TARGET)(vi.fn() as never, (() => state) as never);

describe('switchAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadEncryptedToken.mockResolvedValue({ iv: 'iv', cipherText: 'ct' });
    decryptToken.mockResolvedValue('stored-token');
  });

  it('drops the stored token when the server rejects it with 422', async () => {
    refreshSession.mockRejectedValue(
      httpError(422, 'Token is not a valid multi-account refresh token'),
    );

    await expect(runSwitch()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof MultiAccountSwitchError &&
        error.code === SwitchErrorCode.TOKEN_INVALID &&
        error.isDeadToken,
    );

    expect(deleteEncryptedToken).toHaveBeenCalledWith(TARGET);
  });

  it('drops the stored token when the server rejects it with 401', async () => {
    refreshSession.mockRejectedValue(httpError(401, 'Invalid refresh token'));

    await expect(runSwitch()).rejects.toBeInstanceOf(MultiAccountSwitchError);
    expect(deleteEncryptedToken).toHaveBeenCalledWith(TARGET);
  });

  it.each([400, 403, 404, 429, 500])(
    'keeps the stored token when the refresh fails with %i',
    async (status) => {
      refreshSession.mockRejectedValue(httpError(status, 'nope'));

      await expect(runSwitch()).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof MultiAccountSwitchError &&
          error.code === SwitchErrorCode.REFRESH_REJECTED &&
          !error.isDeadToken,
      );

      expect(deleteEncryptedToken).not.toHaveBeenCalled();
    },
  );

  it('leaves the session cookie alone when the refresh fails', async () => {
    document.cookie = '_session_id=keep-me';
    refreshSession.mockRejectedValue(httpError(422));

    await expect(runSwitch()).rejects.toThrow();

    expect(document.cookie).toContain('_session_id=keep-me');
  });

  it('surfaces a missing stored token without calling the server', async () => {
    loadEncryptedToken.mockResolvedValue(null);

    await expect(runSwitch()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof MultiAccountSwitchError &&
        error.code === SwitchErrorCode.TOKEN_MISSING,
    );

    expect(refreshSession).not.toHaveBeenCalled();
  });
});
