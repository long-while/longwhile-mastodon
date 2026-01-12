const STORAGE_KEY = 'MA_ACTIVE_ACCOUNT_ID';

const canUseStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

export const setActiveAccountIdInStorage = (accountId: string): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, accountId);
  } catch (error) {
    console.warn('Failed to persist active account id:', error);
  }
};

export const getActiveAccountIdFromStorage = (): string | null => {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to read active account id:', error);
    return null;
  }
};

export const clearActiveAccountIdInStorage = (): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear active account id:', error);
  }
};

export const clearActiveAccountIdIfMatches = (accountId: string): void => {
  if (!canUseStorage()) return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === accountId) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to clear active account id for account removal:', error);
  }
};
import type { Store } from '@reduxjs/toolkit';

import { hydrateMultiAccountAction } from '../actions/multi_account';
import type { MultiAccountEntry } from '../types/multi_account';

import { loadAllEntries, loadEncryptedToken } from './multi_account_db';
import { decryptToken } from './multi_account_crypto';
import { setActiveAccountToken } from '../api';

/**
 * Hydrate the Redux store with data from IndexedDB
 */
export const hydrateStore = async (store: Store) => {
  try {
    const storedEntries = await loadAllEntries();
    const accounts: Record<string, MultiAccountEntry> = { ...storedEntries };

    const state: any = store.getState?.() ?? null;
    const meAccountId = state?.getIn?.(['meta', 'me']);
    const currentAccount =
      meAccountId && state?.getIn
        ? state.getIn(['accounts', meAccountId])
        : null;

    const getField = (record: any, key: string) => {
      if (!record) {
        return undefined;
      }

      if (typeof record.get === 'function') {
        return record.get(key);
      }

      return record[key];
    };

    const currentAccountId = getField(currentAccount, 'id');

    const storedEntryList = Object.values(storedEntries);
    const latestStoredEntry =
      storedEntryList.length > 0
        ? storedEntryList.reduce<MultiAccountEntry | null>((latest, entry) => {
            if (!entry?.lastUsedAt) {
              return latest;
            }
            if (!latest?.lastUsedAt) {
              return entry;
            }
            return new Date(entry.lastUsedAt) > new Date(latest.lastUsedAt)
              ? entry
              : latest;
          }, null)
        : null;

    if (typeof currentAccountId === 'string') {
      const accountId = currentAccountId;
      if (!accounts[accountId]) {
        accounts[accountId] = {
          id: accountId,
          acct:
            getField(currentAccount, 'acct') ??
            getField(currentAccount, 'username') ??
            '',
          displayName:
            getField(currentAccount, 'display_name') ??
            getField(currentAccount, 'username') ??
            '',
          avatar:
            getField(currentAccount, 'avatar') ??
            getField(currentAccount, 'avatar_static') ??
            '',
          encryptedTokenRef: '',
          lastUsedAt: new Date().toISOString(),
        };
      }
    }

    const preferredAccountId =
      (typeof currentAccountId === 'string' && accounts[currentAccountId]
        ? currentAccountId
        : null) ??
      latestStoredEntry?.id ??
      null;

    if (preferredAccountId) {
      try {
        const encrypted = await loadEncryptedToken(preferredAccountId);
        if (encrypted) {
          const token = await decryptToken(encrypted);
          setActiveAccountToken(token);
        }
      } catch (error) {
        console.error(
          `Failed to restore token for account ${preferredAccountId}:`,
          error,
        );
      }
    }

    store.dispatch(
      hydrateMultiAccountAction({
        activeAccountId: preferredAccountId,
        accounts,
      }),
    );
  } catch (error) {
    console.error('Failed to hydrate multi-account store:', error);
  }
};

/**
 * Attach persistence layer to Redux store
 * Subscribes to state changes and saves to IndexedDB
 */
export const attachPersistence = (store: Store) => {
  let previousState = store.getState();

  store.subscribe(() => {
    const currentState = store.getState();
    const previousAccounts = previousState.getIn(['multiAccount', 'accounts']);
    const currentAccounts = currentState.getIn(['multiAccount', 'accounts']);

    // Check if accounts have changed
    if (previousAccounts !== currentAccounts) {
      // Save any new or updated accounts
      // Note: The actual encrypted tokens are saved in the action creators
      // This subscription is primarily for future enhancements where we might
      // want to persist other state changes
    }

    previousState = currentState;
  });
};
