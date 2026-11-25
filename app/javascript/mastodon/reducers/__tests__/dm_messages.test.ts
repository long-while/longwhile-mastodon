import { describe, expect, it } from 'vitest';

import { fetchDmRoomStatuses } from '../../actions/dm_rooms';
import type { DmMessagesState } from '../dm_messages';
import { dmMessagesReducer } from '../dm_messages';

const room = (overrides = {}) => ({
  statusIds: [],
  pending: [],
  hasMore: true,
  isLoading: false,
  hasError: false,
  loaded: false,
  ...overrides,
});

const rejection = (arg: Parameters<typeof fetchDmRoomStatuses.rejected>[2]) =>
  fetchDmRoomStatuses.rejected(null, 'request-id', arg, {
    error: new Error('x'),
  });

const fulfillment = (
  arg: Parameters<typeof fetchDmRoomStatuses.fulfilled>[2],
  statusIds: string[],
) =>
  fetchDmRoomStatuses.fulfilled(
    {
      roomId: arg.roomId,
      statusIds,
      hasMore: false,
      mode: arg.sinceId ? 'append' : 'replace',
    },
    'request-id',
    arg,
  );

describe('dmMessagesReducer room loading', () => {
  it('marks a normal load as loading and clears an old error', () => {
    const state: DmMessagesState = { '1': room({ hasError: true }) };

    const next = dmMessagesReducer(
      state,
      fetchDmRoomStatuses.pending('request-id', { roomId: '1' }),
    );

    expect(next['1']).toMatchObject({ isLoading: true, hasError: false });
  });

  it('does not touch the loading state for a silent read', () => {
    const state: DmMessagesState = { '1': room({ hasError: true }) };

    const next = dmMessagesReducer(
      state,
      fetchDmRoomStatuses.pending('request-id', { roomId: '1', silent: true }),
    );

    expect(next['1']).toMatchObject({ isLoading: false, hasError: true });
  });

  it('does not create a room for a silent read', () => {
    const next = dmMessagesReducer(
      {},
      fetchDmRoomStatuses.pending('request-id', { roomId: '1', silent: true }),
    );

    expect(next['1']).toBeUndefined();
  });

  it('keeps a loaded room without messages out of the error screen when a silent read fails', () => {
    const state: DmMessagesState = { '1': room({ loaded: true }) };

    const next = dmMessagesReducer(
      state,
      rejection({ roomId: '1', silent: true }),
    );

    expect(next['1']?.hasError).toBe(false);
  });

  it('still shows the error screen when a normal first load fails', () => {
    const state: DmMessagesState = { '1': room({ isLoading: true }) };

    const next = dmMessagesReducer(state, rejection({ roomId: '1' }));

    expect(next['1']).toMatchObject({ isLoading: false, hasError: true });
  });

  it('merges silently read messages without ending another load', () => {
    const state: DmMessagesState = {
      '1': room({ loaded: true, isLoading: true, statusIds: ['5'] }),
    };

    const next = dmMessagesReducer(
      state,
      fulfillment({ roomId: '1', sinceId: '5', silent: true }, ['9']),
    );

    expect(next['1']).toMatchObject({
      statusIds: ['5', '9'],
      isLoading: true,
      loaded: true,
    });
  });

  it('finishes a normal load', () => {
    const state: DmMessagesState = { '1': room({ isLoading: true }) };

    const next = dmMessagesReducer(state, fulfillment({ roomId: '1' }, ['5']));

    expect(next['1']).toMatchObject({
      isLoading: false,
      loaded: true,
      statusIds: ['5'],
    });
  });
});
