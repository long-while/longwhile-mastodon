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

  // @_longwhile — 회귀 방지. 한때 다중 계정 부팅 코드가 localStorage 에 적힌
  //   "마지막 전환 계정" 으로 `meta.me` 를 덮어썼다. 서버 세션이 다른 계정이면
  //   계정 관리 목록의 초록 체크가 두 계정에 찍히고 둘 다 전환이 막혔으며,
  //   화면의 계정과 글이 올라가는 계정이 갈라졌다. `me` 는 세션만 정한다.
  it('never lets a client-side action rewrite meta.me', () => {
    const hydrated = metaReducer(undefined, {
      type: STORE_HYDRATE,
      state: fromJS({
        meta: { me: '1' },
        role: { permissions: '0' },
      }),
    });

    expect(hydrated.get('me')).toEqual('1');

    // merge 결과는 Map<any, any> 로 추론된다. 리듀서가 받는 상태 타입으로 맞춘다.
    const after = metaReducer(hydrated as ImmutableMap<string, string | null>, {
      type: 'MULTI_ACCOUNT_SET_ACTIVE_ACCOUNT_META',
      payload: { accountId: '2' },
    });

    expect(after.get('me')).toEqual('1');
  });
});
