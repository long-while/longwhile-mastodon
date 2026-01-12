import type { Reducer } from '@reduxjs/toolkit';
import { Map as ImmutableMap, Record as ImmutableRecord } from 'immutable';

import type { MultiAccountEntry } from '../types/multi_account';

// Define the structure for a single account entry
const AccountEntry = ImmutableRecord<MultiAccountEntry>({
  id: '',
  acct: '',
  displayName: '',
  avatar: '',
  encryptedTokenRef: '',
  lastUsedAt: '',
});

// Define the state structure
interface MultiAccountStateRecord {
  activeAccountId: string | null;
  accounts: ImmutableMap<string, ImmutableRecord<MultiAccountEntry>>;
}

const initialState = ImmutableRecord<MultiAccountStateRecord>({
  activeAccountId: null,
  accounts: ImmutableMap(),
})();

type State = typeof initialState;

// Action types
const MULTI_ACCOUNT_HYDRATE = 'MULTI_ACCOUNT_HYDRATE';
const MULTI_ACCOUNT_REGISTER = 'MULTI_ACCOUNT_REGISTER';
const MULTI_ACCOUNT_SWITCH = 'MULTI_ACCOUNT_SWITCH';
const MULTI_ACCOUNT_REMOVE = 'MULTI_ACCOUNT_REMOVE';
const MULTI_ACCOUNT_TOUCH = 'MULTI_ACCOUNT_TOUCH';

interface HydrateAction {
  type: typeof MULTI_ACCOUNT_HYDRATE;
  payload: {
    activeAccountId: string | null;
    accounts: Record<string, MultiAccountEntry>;
  };
}

interface RegisterAction {
  type: typeof MULTI_ACCOUNT_REGISTER;
  payload: MultiAccountEntry;
}

interface SwitchAction {
  type: typeof MULTI_ACCOUNT_SWITCH;
  payload: {
    accountId: string;
  };
}

interface RemoveAction {
  type: typeof MULTI_ACCOUNT_REMOVE;
  payload: {
    accountId: string;
  };
}

interface TouchAction {
  type: typeof MULTI_ACCOUNT_TOUCH;
  payload: {
    accountId: string;
  };
}

type MultiAccountAction =
  | HydrateAction
  | RegisterAction
  | SwitchAction
  | RemoveAction
  | TouchAction;

// Reducer handlers
const hydrate = (state: State, action: HydrateAction): State => {
  const { activeAccountId, accounts } = action.payload;
  const accountsMap = ImmutableMap(
    Object.entries(accounts).map(([id, entry]) => [id, AccountEntry(entry)]),
  );

  return state.set('activeAccountId', activeAccountId).set('accounts', accountsMap);
};

const register = (state: State, action: RegisterAction): State => {
  const entry = AccountEntry(action.payload);
  return state.setIn(['accounts', entry.id], entry);
};

const switchActive = (state: State, action: SwitchAction): State => {
  const { accountId } = action.payload;

  if (!state.accounts.has(accountId)) {
    return state;
  }

  return state
    .set('activeAccountId', accountId)
    .updateIn(['accounts', accountId], (account) =>
      account
        ? (account as ImmutableRecord<MultiAccountEntry>).set(
            'lastUsedAt',
            new Date().toISOString(),
          )
        : account,
    );
};

const remove = (state: State, action: RemoveAction): State => {
  const { accountId } = action.payload;

  let newState = state.deleteIn(['accounts', accountId]);

  if (state.activeAccountId === accountId) {
    newState = newState.set('activeAccountId', null);
  }

  return newState;
};

const touch = (state: State, action: TouchAction): State => {
  const { accountId } = action.payload;

  if (!state.accounts.has(accountId)) {
    return state;
  }

  return state.updateIn(['accounts', accountId], (account) =>
    account
      ? (account as ImmutableRecord<MultiAccountEntry>).set(
          'lastUsedAt',
          new Date().toISOString(),
        )
      : account,
  );
};

// Reducer
export const multiAccountReducer: Reducer<State> = (
  state = initialState,
  action: unknown,
) => {
  const typedAction = action as MultiAccountAction;

  switch (typedAction.type) {
    case MULTI_ACCOUNT_HYDRATE:
      return hydrate(state, typedAction as HydrateAction);
    case MULTI_ACCOUNT_REGISTER:
      return register(state, typedAction as RegisterAction);
    case MULTI_ACCOUNT_SWITCH:
      return switchActive(state, typedAction as SwitchAction);
    case MULTI_ACCOUNT_REMOVE:
      return remove(state, typedAction as RemoveAction);
    case MULTI_ACCOUNT_TOUCH:
      return touch(state, typedAction as TouchAction);
    default:
      return state;
  }
};
