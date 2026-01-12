import { rootReducer } from '../index';
import {
  hydrateMultiAccountAction,
  switchAccountAction,
} from '../../actions/multi_account';
import { RESET_ALL } from '../../actions/store';

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
    expect(resetState.getIn(['multiAccount', 'accounts']).has('1')).toBe(true);
  });
});

