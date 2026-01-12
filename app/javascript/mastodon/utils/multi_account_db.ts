import { openDB, type IDBPDatabase } from 'idb';

import { currentAuthorizationToken } from 'mastodon/api';

import type {
  EncryptedPayload,
  MultiAccountEntry,
} from '../types/multi_account';

const DB_NAME = 'multiAccountStore';
const STORE_NAME = 'accounts';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase | null = null;

/**
 * Open the multi-account database
 */
export const openMultiAccountDB = async (): Promise<IDBPDatabase> => {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    return dbInstance;
  } catch (error) {
    console.error('Failed to open IndexedDB:', error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.name === 'QuotaExceededError') {
        throw new Error('저장 공간이 부족합니다. 브라우저 캐시를 정리해주세요.');
      } else if (error.name === 'SecurityError') {
        throw new Error('IndexedDB 접근이 차단되었습니다. 시크릿 모드에서는 사용할 수 없습니다.');
      } else if (error.name === 'VersionError') {
        throw new Error('데이터베이스 버전 오류가 발생했습니다. 페이지를 새로고침해주세요.');
      }
    }

    throw new Error('계정 정보를 저장할 수 없습니다.');
  }
};

export type StoredAccountRecord = {
  token: EncryptedPayload;
  entry?: MultiAccountEntry;
  credentials?: EncryptedPayload;
};

const isStoredAccountRecord = (value: unknown): value is StoredAccountRecord => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'token' in value
  );
};

const normalizeRecord = (value: unknown): StoredAccountRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (isStoredAccountRecord(value)) {
    return value;
  }

  return {
    token: value as EncryptedPayload,
  };
};

/**
 * Save encrypted token (and metadata) for an account
 */
export const saveEncryptedToken = async (
  accountId: string,
  payload: EncryptedPayload,
  entry: MultiAccountEntry,
): Promise<void> => {
  try {
    const db = await openMultiAccountDB();
    const record: StoredAccountRecord = {
      token: payload,
      entry,
    };
    await db.put(STORE_NAME, record, accountId);
  } catch (error) {
    console.error(`Failed to save encrypted token for account ${accountId}:`, error);

    // Re-throw the error from openMultiAccountDB or add specific handling
    if (error instanceof Error && error.message.includes('저장 공간')) {
      throw error; // Pass through storage quota errors
    }

    throw new Error('계정 토큰을 저장할 수 없습니다.');
  }
};

/**
 * Load encrypted token for an account
 */
export const loadEncryptedToken = async (
  accountId: string,
): Promise<EncryptedPayload | null> => {
  try {
    const db = await openMultiAccountDB();
    const stored = await db.get(STORE_NAME, accountId);

    if (!stored) {
      return null;
    }

    if (isStoredAccountRecord(stored)) {
      return stored.token;
    }

    return stored as EncryptedPayload;
  } catch (error) {
    console.error(`Failed to load encrypted token for account ${accountId}:`, error);

    // If database access fails, return null rather than blocking the app
    // The calling code should handle the missing token gracefully
    return null;
  }
};

/**
 * Delete encrypted token for an account
 */
export const deleteEncryptedToken = async (accountId: string): Promise<void> => {
  try {
    const db = await openMultiAccountDB();
    await db.delete(STORE_NAME, accountId);
  } catch (error) {
    console.error(`Failed to delete encrypted token for account ${accountId}:`, error);
    // Don't throw on delete errors - log and continue
    // This prevents the app from breaking if deletion fails
  }
};

/**
 * Load all account entries (without decrypted tokens)
 */
const fetchAccountMetadata = async (
  accountId: string,
): Promise<MultiAccountEntry | null> => {
  try {
    const token = currentAuthorizationToken();

    if (!token) {
      return null;
    }

    const response = await fetch(`/api/v1/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const account = await response.json();

    return {
      id: account.id,
      acct: account.acct ?? account.username ?? '',
      displayName: account.display_name ?? account.username ?? '',
      avatar: account.avatar ?? account.avatar_static ?? '',
      encryptedTokenRef: '',
      lastUsedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `Failed to fetch metadata for multi-account entry ${accountId}:`,
      error,
    );
    return null;
  }
};

export const loadAllEntries = async (): Promise<Record<string, MultiAccountEntry>> => {
  try {
    const db = await openMultiAccountDB();
    const keys = await db.getAllKeys(STORE_NAME);
    const entries: Record<string, MultiAccountEntry> = {};
    const legacyRecords: Array<{
      id: string;
      payload: EncryptedPayload;
    }> = [];

    for (const key of keys) {
      const stored = await db.get(STORE_NAME, key);
      if (stored && typeof key === 'string') {
        const normalized = normalizeRecord(stored);
        if (normalized) {
          if (normalized.entry) {
            entries[key] = normalized.entry;
          } else {
            legacyRecords.push({
              id: key,
              payload: normalized.token,
            });
          }
        }
      }
    }

    if (legacyRecords.length > 0) {
      for (const record of legacyRecords) {
        try {
          const entry = await fetchAccountMetadata(record.id);
          if (!entry) {
            continue;
          }

          entries[record.id] = entry;

          await db.put(
            STORE_NAME,
            {
              token: record.payload,
              entry,
            },
            record.id,
          );
        } catch (error) {
          console.error(
            `Failed to upgrade multi-account entry for account ${record.id}:`,
            error,
          );
        }
      }
    }

    return entries;
  } catch (error) {
    console.error('Failed to load all account entries:', error);
    // Return empty object if loading fails
    return {};
  }
};

/**
 * Clear all stored account data
 */
export const clearAllAccounts = async (): Promise<void> => {
  try {
    const db = await openMultiAccountDB();
    await db.clear(STORE_NAME);
  } catch (error) {
    console.error('Failed to clear all accounts:', error);
    // Don't throw on clear errors
  }
};
