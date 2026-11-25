import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  removeAccount,
  revokeAllStoredTokens,
  revokeStoredToken,
} from '../multi_account';

const revokeRefreshToken = vi.fn();
const loadEncryptedToken = vi.fn();
const loadAllEntries = vi.fn();
const deleteEncryptedToken = vi.fn();
const decryptToken = vi.fn();
const setActiveAccountToken = vi.fn();
const clearActiveAccountIdIfMatches = vi.fn();

vi.mock('../../api/multi_accounts', () => ({
  revokeRefreshToken: (token: string) => revokeRefreshToken(token) as unknown,
}));

vi.mock('../../utils/multi_account_db', () => ({
  loadEncryptedToken: (id: string) => loadEncryptedToken(id) as unknown,
  loadAllEntries: () => loadAllEntries() as unknown,
  deleteEncryptedToken: (id: string) => deleteEncryptedToken(id) as unknown,
  saveEncryptedToken: vi.fn(),
}));

vi.mock('../../utils/multi_account_crypto', () => ({
  decryptToken: (payload: unknown) => decryptToken(payload) as unknown,
  encryptToken: vi.fn(),
}));

vi.mock('../../api', () => ({
  default: () => ({ get: vi.fn() }),
  setActiveAccountToken: (token: string | null) =>
    setActiveAccountToken(token) as unknown,
  updateCSRFToken: vi.fn(),
}));

vi.mock('../importer', () => ({ importFetchedAccount: vi.fn() }));

vi.mock('../../utils/switch_logger', () => ({ default: {} }));

vi.mock('../../utils/multi_account_storage', () => ({
  clearActiveAccountIdIfMatches: (id: string) =>
    clearActiveAccountIdIfMatches(id) as unknown,
  markSwitchIntent: vi.fn(),
  setActiveAccountIdInStorage: vi.fn(),
}));

const payloadFor = (id: string) => ({ iv: 'iv', cipherText: `cipher-${id}` });

const getState = (activeAccountId: string | null) => () => ({
  getIn: (path: string[]) =>
    path.join('.') === 'multiAccount.activeAccountId' ? activeAccountId : null,
});

describe('revoking stored switching tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadEncryptedToken.mockImplementation((id: string) =>
      Promise.resolve(payloadFor(id)),
    );
    decryptToken.mockImplementation((payload: { cipherText: string }) =>
      Promise.resolve(payload.cipherText.replace('cipher-', 'token-')),
    );
    revokeRefreshToken.mockResolvedValue(undefined);
    deleteEncryptedToken.mockResolvedValue(undefined);
  });

  it('sends the decrypted token to the server', async () => {
    await revokeStoredToken('A');

    expect(revokeRefreshToken).toHaveBeenCalledWith('token-A');
  });

  it('does nothing when no token is stored', async () => {
    loadEncryptedToken.mockResolvedValue(null);

    await revokeStoredToken('A');

    expect(revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('swallows server and decryption failures', async () => {
    revokeRefreshToken.mockRejectedValue(new Error('offline'));
    await expect(revokeStoredToken('A')).resolves.toBeUndefined();

    decryptToken.mockRejectedValue(new Error('bad key'));
    await expect(revokeStoredToken('B')).resolves.toBeUndefined();
  });

  it('revokes every stored entry', async () => {
    loadAllEntries.mockResolvedValue({ A: {}, B: {} });

    await revokeAllStoredTokens();

    expect(revokeRefreshToken).toHaveBeenCalledWith('token-A');
    expect(revokeRefreshToken).toHaveBeenCalledWith('token-B');
  });

  it('removeAccount revokes on the server before deleting locally', async () => {
    const order: string[] = [];
    revokeRefreshToken.mockImplementation(() => {
      order.push('revoke');
      return Promise.resolve();
    });
    deleteEncryptedToken.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve();
    });
    const dispatch = vi.fn();

    await removeAccount('A')(dispatch, getState('A') as never);

    expect(order).toEqual(['revoke', 'delete']);
    expect(dispatch).toHaveBeenCalled();
    expect(setActiveAccountToken).toHaveBeenCalledWith(null);
    expect(clearActiveAccountIdIfMatches).toHaveBeenCalledWith('A');
  });

  it('removeAccount still deletes locally when the server call fails', async () => {
    revokeRefreshToken.mockRejectedValue(new Error('offline'));

    await removeAccount('A')(vi.fn(), getState(null) as never);

    expect(deleteEncryptedToken).toHaveBeenCalledWith('A');
    expect(setActiveAccountToken).not.toHaveBeenCalled();
  });
});
