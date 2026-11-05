import { Map as ImmutableMap, fromJS } from 'immutable';

import { makeGetStatus as makeGetStatusUntyped } from '..';

const makeGetStatus = makeGetStatusUntyped as () => (
  state: unknown,
  props: { id: string; contextType?: string },
) => unknown;

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
