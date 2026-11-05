import { fromJS } from 'immutable';
import type { Map as ImmutableMap } from 'immutable';

import {
  hydrateMultiAccountAction,
  switchAccountAction,
} from '../../actions/multi_account';
import { RESET_ALL, STORE_HYDRATE } from '../../actions/store';
import { rootReducer } from '../index';
import metaReducer from '../meta';

describe('rootReducer', () => {
  it('preserves multiAccount state when RESET_ALL is dispatched', () => {
    const baseState = rootReducer(undefined, { type: '@@INIT' });

    const hydratedState = rootReducer(
      baseState,
      hydrateMultiAccountAction({
        activeAccountId: null,
        accounts: {
          '1': {
            id: '1',
            acct: '@demo',
            displayName: 'Demo User',
            avatar: '',
            encryptedTokenRef: '',
            lastUsedAt: new Date().toISOString(),
          },
        },
      }),
    );

    const switchedState = rootReducer(hydratedState, switchAccountAction('1'));

    const resetState = rootReducer(switchedState, { type: RESET_ALL });

    expect(resetState.getIn(['multiAccount', 'activeAccountId'])).toEqual('1');
    expect(
      (
        resetState.getIn(['multiAccount', 'accounts']) as ImmutableMap<
          string,
          unknown
        >
      ).has('1'),
    ).toBe(true);
  });

  it('never lets a client-side action rewrite meta.me', () => {
    const hydrated = metaReducer(undefined, {
      type: STORE_HYDRATE,
      state: fromJS({
        meta: { me: '1' },
        role: { permissions: '0' },
      }),
    });

    expect(hydrated.get('me')).toEqual('1');

    const after = metaReducer(hydrated as ImmutableMap<string, string | null>, {
      type: 'MULTI_ACCOUNT_SET_ACTIVE_ACCOUNT_META',
      payload: { accountId: '2' },
    });

    expect(after.get('me')).toEqual('1');
  });
});
