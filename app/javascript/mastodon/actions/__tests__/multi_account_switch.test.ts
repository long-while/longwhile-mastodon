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

// NOTE: `vi.resetModules()` 를 쓰지 않는다. 모듈을 다시 불러오면
// `MultiAccountSwitchError` 클래스가 새로 만들어져 `instanceof` 가 깨진다.
const runSwitch = () =>
  switchAccount(TARGET)(vi.fn() as never, (() => state) as never);

describe('switchAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadEncryptedToken.mockResolvedValue({ iv: 'iv', cipherText: 'ct' });
    decryptToken.mockResolvedValue('stored-token');
  });

  // 회귀 방지: 422 는 `ensure_refresh_token_valid!` 가 "이건 다중 계정 토큰이
  // 아니다" 로 막은 것이다. 저장된 토큰을 그대로 두면 같은 오류가 영원히
  // 반복되므로 반드시 지워야 한다.
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

  // 회귀 방지: 403 은 기능이 꺼졌거나 정지된 계정이다. 토큰은 멀쩡하므로
  // 지워서도, "계정을 다시 추가하라" 고 권해서도 안 된다.
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

  // 회귀 방지: 예전에는 refresh 를 부르기 전에 모든 쿠키를 지웠다. 실패하면
  // 이 탭은 세션 쿠키가 없는 채로 남아 "로그아웃된" 것처럼 보였다.
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
