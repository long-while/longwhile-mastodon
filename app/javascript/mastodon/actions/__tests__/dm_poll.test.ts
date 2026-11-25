import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pollDmChat } from '../dm_rooms';

const apiGetDmRooms = vi.fn();
const apiGetDmRoomStatuses = vi.fn();

vi.mock('../../api/dm_rooms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiGetDmRooms: (url?: string) => apiGetDmRooms(url) as unknown,
  apiGetDmRoomStatuses: (roomId: string, options: unknown) =>
    apiGetDmRoomStatuses(roomId, options) as unknown,
}));

vi.mock('../importer', () => ({
  importFetchedAccounts: () => ({ type: 'ACCOUNTS_IMPORT_TEST' }),
  importFetchedStatuses: () => ({ type: 'STATUSES_IMPORT_TEST' }),
}));

interface RecordedAction {
  type: string;
  payload?: unknown;
  meta?: { arg?: { silent?: boolean; sinceId?: string } };
}

const actions: RecordedAction[] = [];
let state: unknown;

const getState = () => state;

const dispatch = (action: unknown): unknown => {
  if (typeof action === 'function') {
    return (action as (d: unknown, g: unknown) => unknown)(dispatch, getState);
  }

  actions.push(action as RecordedAction);
  return action;
};

const stateWith = (room?: { loaded: boolean; statusIds: string[] }) => ({
  dmRooms: { activeRoomId: room ? 'room' : null, rooms: {}, order: [] },
  dmMessages: room ? { room } : {},
});

const poll = () => dispatch(pollDmChat()) as Promise<{ payload: string }>;

const roomFetches = () =>
  actions.filter((action) => action.type === 'dm_messages/fetch/pending');

describe('pollDmChat', () => {
  beforeEach(() => {
    actions.length = 0;
    apiGetDmRooms.mockReset();
    apiGetDmRoomStatuses.mockReset();
    apiGetDmRooms.mockResolvedValue({ rooms: [], links: { refs: [] } });
    apiGetDmRoomStatuses.mockResolvedValue({
      statuses: [],
      links: { refs: [] },
    });
  });

  it('only refreshes the list when no room is open', async () => {
    state = stateWith();

    expect((await poll()).payload).toBe('ok');
    expect(apiGetDmRoomStatuses).not.toHaveBeenCalled();
  });

  it('leaves a room alone until its first load has finished', async () => {
    state = stateWith({ loaded: false, statusIds: [] });

    expect((await poll()).payload).toBe('ok');
    expect(apiGetDmRoomStatuses).not.toHaveBeenCalled();
  });

  it('reads an open room silently, from its newest message', async () => {
    state = stateWith({ loaded: true, statusIds: ['5', '9'] });

    await poll();

    expect(apiGetDmRoomStatuses).toHaveBeenCalledWith('room', {
      maxId: undefined,
      sinceId: '9',
    });
    expect(roomFetches()[0]?.meta?.arg?.silent).toBe(true);
  });

  it('reads a loaded room that has no messages, silently', async () => {
    state = stateWith({ loaded: true, statusIds: [] });

    await poll();

    expect(apiGetDmRoomStatuses).toHaveBeenCalledWith('room', {
      maxId: undefined,
      sinceId: undefined,
    });
    expect(roomFetches()[0]?.meta?.arg?.silent).toBe(true);
  });

  it('reports an error for a failed read, and stop once the session is gone', async () => {
    state = stateWith({ loaded: true, statusIds: ['9'] });

    apiGetDmRoomStatuses.mockRejectedValue(new Error('offline'));
    expect((await poll()).payload).toBe('error');

    apiGetDmRooms.mockRejectedValue({ response: { status: 401 } });
    expect((await poll()).payload).toBe('stop');
  });
});
