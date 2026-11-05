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

const SWITCH_INTENT_KEY = 'MA_SWITCH_INTENT';

export const markSwitchIntent = (accountId: string): void => {
  try {
    window.sessionStorage.setItem(SWITCH_INTENT_KEY, accountId);
  } catch {
  }
};

export const takeSwitchIntent = (): string | null => {
  try {
    const value = window.sessionStorage.getItem(SWITCH_INTENT_KEY);
    window.sessionStorage.removeItem(SWITCH_INTENT_KEY);
    return value;
  } catch {
    return null;
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
import { me } from '../initial_state';
import type { MultiAccountEntry } from '../types/multi_account';

import { loadAllEntries } from './multi_account_db';

export const hydrateStore = async (store: Store) => {
  try {
    const storedEntries = await loadAllEntries();

    const accounts: Record<string, MultiAccountEntry> = {};

    Object.entries(storedEntries).forEach(([key, entry]) => {
      if (!entry) {
        return;
      }

      const id = entry.id || key;
      accounts[id] = { ...entry, id };
    });

    const sessionAccountId = me ?? null;

    if (sessionAccountId && !accounts[sessionAccountId]) {
      const state: any = store.getState?.() ?? null;
      const currentAccount = state?.getIn?.(['accounts', sessionAccountId]);

      const getField = (record: any, key: string) => {
        if (!record) {
          return undefined;
        }

        if (typeof record.get === 'function') {
          return record.get(key);
        }

        return record[key];
      };

      accounts[sessionAccountId] = {
        id: sessionAccountId,
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

    store.dispatch(
      hydrateMultiAccountAction({
        activeAccountId: sessionAccountId,
        accounts,
      }),
    );
  } catch (error) {
    console.error('Failed to hydrate multi-account store:', error);
  }
};
