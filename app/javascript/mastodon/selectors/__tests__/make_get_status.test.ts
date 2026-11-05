import { Map as ImmutableMap, fromJS } from 'immutable';

import { makeGetStatus as makeGetStatusUntyped } from '..';

// selectors/index.js 는 JS 라 reselect 가 인자를 [state] 하나로 추론한다. 실제로는
// 다른 selector 처럼 (state, props) 를 받는다.
const makeGetStatus = makeGetStatusUntyped as () => (
  state: unknown,
  props: { id: string; contextType?: string },
) => unknown;

// @_longwhile — 작성자 계정이 스토어에 없는 글은 그리지 않는다. 예전에는 selector 가
// `undefined.get('id')` 로 터져 화면 전체가 오류 화면으로 바뀌었다.
const stateWith = (accounts: Record<string, unknown>) =>
  ImmutableMap({
    statuses: fromJS({ '1': { id: '1', account: '10', reblog: null } }),
    accounts: fromJS(accounts),
    filters: ImmutableMap(),
  });

describe('makeGetStatus', () => {
  it('returns null instead of crashing when the author is missing', () => {
    const getStatus = makeGetStatus();

    expect(getStatus(stateWith({}), { id: '1' })).toBeNull();
  });

  it('still returns the status when the author is loaded', () => {
    const getStatus = makeGetStatus();
    const status = getStatus(stateWith({ '10': { id: '10' } }), {
      id: '1',
    }) as ImmutableMap<string, unknown> | null;

    expect(status?.get('id')).toBe('1');
  });
});
