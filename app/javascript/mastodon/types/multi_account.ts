export interface MultiAccountEntry {
  id: string;
  acct: string;
  displayName: string;
  avatar: string;
  encryptedTokenRef: string;
  lastUsedAt: string;
}

export interface MultiAccountState {
  activeAccountId: string | null;
  accounts: Record<string, MultiAccountEntry>;
}

export interface EncryptedPayload {
  iv: string;
  cipherText: string;
}

export enum CryptoErrorCode {
  UNSUPPORTED = 'unsupported',
  KEY_GENERATION_FAILED = 'key_generation_failed',
  KEY_STORAGE_FAILED = 'key_storage_failed',
  STORAGE_ACCESS_DENIED = 'storage_access_denied',
  ENCRYPT_FAILED = 'encrypt_failed',
  DECRYPT_FAILED = 'decrypt_failed',
}

export class MultiAccountCryptoError extends Error {
  constructor(
    public code: CryptoErrorCode,
    message?: string,
  ) {
    super(message || `Crypto error: ${code}`);
    this.name = 'MultiAccountCryptoError';
  }
}

export enum SwitchErrorCode {
  ACCOUNT_NOT_FOUND = 'account_not_found',
  TOKEN_MISSING = 'token_missing',
  TOKEN_INVALID = 'token_invalid',
  SESSION_TOKEN_MISSING = 'session_token_missing',
  REFRESH_REJECTED = 'refresh_rejected',
}

export class MultiAccountSwitchError extends Error {
  constructor(
    public code: SwitchErrorCode,
    message?: string,
  ) {
    super(message || `Switch error: ${code}`);
    this.name = 'MultiAccountSwitchError';
  }

  get isDeadToken(): boolean {
    return (
      this.code === SwitchErrorCode.TOKEN_MISSING ||
      this.code === SwitchErrorCode.TOKEN_INVALID
    );
  }
}
