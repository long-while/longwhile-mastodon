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

// 전환 직후 새로고침을 사이에 두고 "어느 계정으로 가려 했는지" 를 넘긴다.
// 탭 안에서만 살면 되므로 sessionStorage 를 쓴다.
const SWITCH_INTENT_KEY = 'MA_SWITCH_INTENT';

export const markSwitchIntent = (accountId: string): void => {
  try {
    window.sessionStorage.setItem(SWITCH_INTENT_KEY, accountId);
  } catch {
    // sessionStorage 를 못 쓰면 확인만 못 할 뿐이다. 전환 자체는 진행한다.
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

/**
 * Hydrate the Redux store with data from IndexedDB
 *
 * @_longwhile — **여기서 전역 토큰을 건드리지 않는다.** 예전에는 이 함수가
 *   저장된 토큰을 복호화해 `setActiveAccountToken` 까지 했는데, `main.tsx` 의
 *   부팅 코드도 같은 일을 하고 있어서 **둘 중 늦게 끝난 쪽이 이겼다.** 둘이
 *   다른 계정을 가리키면 새로고침할 때마다 글이 올라가는 계정이 바뀌었다.
 *   토큰은 `main.tsx` 한 곳에서만 정한다.
 */
export const hydrateStore = async (store: Store) => {
  try {
    const storedEntries = await loadAllEntries();

    // IndexedDB 의 키와 항목의 `id` 가 어긋난 기록이 남아 있을 수 있다
    // (저장할 때 쓴 키와 서버가 돌려준 계정이 다른 경우). 리듀서는 `id` 로
    // 키를 잡으므로 여기서도 `id` 를 따른다 — 아니면 목록에서 같은 계정이
    // 두 줄로 보이거나, 눌러도 없는 계정을 찾는다.
    const accounts: Record<string, MultiAccountEntry> = {};

    Object.entries(storedEntries).forEach(([key, entry]) => {
      if (!entry) {
        return;
      }

      const id = entry.id || key;
      accounts[id] = { ...entry, id };
    });

    // 세션이 정한 계정이 곧 활성 계정이다. 저장된 항목이 없으면 만들어 둔다.
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
