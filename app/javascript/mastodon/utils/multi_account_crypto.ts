import { openDB } from 'idb';

import type { EncryptedPayload } from '../types/multi_account';
import { CryptoErrorCode, MultiAccountCryptoError } from '../types/multi_account';

const CRYPTO_KEY_DB = 'multiAccountCryptoKeys';
const CRYPTO_KEY_STORE = 'keys';
const CRYPTO_KEY_NAME = 'master';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * Ensure WebCrypto API is supported
 */
const checkSupport = () => {
  if (!window.crypto || !window.crypto.subtle) {
    throw new MultiAccountCryptoError(
      CryptoErrorCode.UNSUPPORTED,
      'WebCrypto API is not supported in this environment',
    );
  }
};

/**
 * Open the crypto keys database
 */
const openCryptoKeyDB = async () => {
  try {
    return await openDB(CRYPTO_KEY_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CRYPTO_KEY_STORE)) {
          db.createObjectStore(CRYPTO_KEY_STORE);
        }
      },
    });
  } catch (error) {
    console.error('Failed to open crypto key database:', error);

    if (error instanceof Error) {
      if (error.name === 'SecurityError') {
        throw new MultiAccountCryptoError(
          CryptoErrorCode.STORAGE_ACCESS_DENIED,
          '암호화 키 저장소 접근이 차단되었습니다. 시크릿 모드에서는 사용할 수 없습니다.',
        );
      }
    }

    throw new MultiAccountCryptoError(
      CryptoErrorCode.KEY_STORAGE_FAILED,
      '암호화 키 저장소를 열 수 없습니다.',
    );
  }
};

/**
 * Generate a new AES-GCM key
 */
const generateKey = async (): Promise<CryptoKey> => {
  try {
    const key = await window.crypto.subtle.generateKey(
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true, // extractable
      ['encrypt', 'decrypt'],
    );
    return key;
  } catch (error) {
    throw new MultiAccountCryptoError(
      CryptoErrorCode.KEY_GENERATION_FAILED,
      `Failed to generate encryption key: ${error}`,
    );
  }
};

/**
 * Ensure encryption key exists, creating it if necessary
 */
export const ensureKey = async (): Promise<CryptoKey> => {
  checkSupport();

  try {
    const db = await openCryptoKeyDB();
    let key = await db.get(CRYPTO_KEY_STORE, CRYPTO_KEY_NAME) as CryptoKey | undefined;

    if (!key) {
      key = await generateKey();
      await db.put(CRYPTO_KEY_STORE, key, CRYPTO_KEY_NAME);
    }

    return key;
  } catch (error) {
    console.error('Failed to ensure encryption key:', error);

    // Re-throw crypto errors
    if (error instanceof MultiAccountCryptoError) {
      throw error;
    }

    throw new MultiAccountCryptoError(
      CryptoErrorCode.KEY_STORAGE_FAILED,
      '암호화 키를 생성하거나 로드할 수 없습니다.',
    );
  }
};

export const resetCryptoKey = async (): Promise<void> => {
  checkSupport();

  try {
    const db = await openCryptoKeyDB();
    await db.delete(CRYPTO_KEY_STORE, CRYPTO_KEY_NAME);
  } catch (error) {
    console.error('Failed to reset crypto key:', error);
    if (error instanceof MultiAccountCryptoError) {
      throw error;
    }

    throw new MultiAccountCryptoError(
      CryptoErrorCode.KEY_STORAGE_FAILED,
      '암호화 키를 초기화할 수 없습니다.',
    );
  }
};

/**
 * Encrypt a token using AES-GCM
 */
export const encryptToken = async (token: string): Promise<EncryptedPayload> => {
  checkSupport();

  try {
    const key = await ensureKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(token);

    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      data,
    );

    return {
      iv: Array.from(iv)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      cipherText: Array.from(new Uint8Array(encryptedData))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    };
  } catch (error) {
    throw new MultiAccountCryptoError(
      CryptoErrorCode.ENCRYPT_FAILED,
      `Failed to encrypt token: ${error}`,
    );
  }
};

/**
 * Decrypt a token using AES-GCM
 */
export const decryptToken = async (payload: EncryptedPayload): Promise<string> => {
  checkSupport();

  try {
    const key = await ensureKey();
    const iv = new Uint8Array(
      payload.iv.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );
    const cipherText = new Uint8Array(
      payload.cipherText.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );

    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      cipherText,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    throw new MultiAccountCryptoError(
      CryptoErrorCode.DECRYPT_FAILED,
      `Failed to decrypt token: ${error}`,
    );
  }
};
