import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectDmChatStream, isDmFallbackPolling } from '../streaming';

interface Handlers {
  onConnect: () => void;
  onDisconnect: () => void;
}

let handlers: Handlers | null = null;
let pollPayload = 'ok';
let connectError: Error | null = null;
const unsubscribe = vi.fn();

vi.mock('../../stream', () => ({
  connectStream:
    (
      _channel: string,
      _params: unknown,
      build: (dispatch: unknown, getState: unknown) => Handlers,
    ) =>
    (dispatch: unknown, getState: unknown) => {
      if (connectError) throw connectError;

      handlers = build(dispatch, getState);
      return () => {
        unsubscribe();
        handlers?.onDisconnect();
      };
    },
}));

vi.mock('../dm_rooms', () => ({
  pollDmChat: () => ({ type: 'dm_rooms/poll', payload: pollPayload }),
  dmChatStreamUpdate: () => ({ type: 'dm_rooms/stream_update' }),
  setDmStreamConnected: (payload: unknown) => ({
    type: 'dm_rooms/stream_connected',
    payload,
  }),
  dmMessageReceived: vi.fn(),
  updateDmReadState: vi.fn(),
}));

const dispatched: { type: string }[] = [];

const dispatch = (action: unknown): unknown => {
  if (typeof action === 'function') {
    return (action as (d: unknown, g: unknown) => unknown)(
      dispatch,
      () => ({}),
    );
  }

  dispatched.push(action as { type: string });
  return action;
};

const polls = () => dispatched.filter((a) => a.type === 'dm_rooms/poll').length;

describe('connectDmChatStream fallback polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    dispatched.length = 0;
    handlers = null;
    pollPayload = 'ok';
    connectError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls slowly while the stream is down and stops once it is back', async () => {
    const disconnect = dispatch(connectDmChatStream()) as () => void;

    handlers?.onDisconnect();
    await vi.advanceTimersByTimeAsync(23_000);
    expect(polls()).toBe(1);

    handlers?.onConnect();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(polls()).toBe(1);

    disconnect();
  });

  it('does not keep polling after the chat screen is left', async () => {
    const disconnect = dispatch(connectDmChatStream()) as () => void;

    disconnect();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(unsubscribe).toHaveBeenCalled();
    expect(polls()).toBe(0);
  });

  it('reports polling only while a poller is actually running', async () => {
    const disconnect = dispatch(connectDmChatStream()) as () => void;
    expect(isDmFallbackPolling()).toBe(false);

    handlers?.onDisconnect();
    expect(isDmFallbackPolling()).toBe(true);

    handlers?.onConnect();
    expect(isDmFallbackPolling()).toBe(false);

    disconnect();
  });

  it('clears the flag when the poller stops itself because the session ended', async () => {
    pollPayload = 'stop';
    const disconnect = dispatch(connectDmChatStream()) as () => void;

    handlers?.onDisconnect();
    expect(isDmFallbackPolling()).toBe(true);

    await vi.advanceTimersByTimeAsync(23_000);

    expect(polls()).toBe(1);
    expect(isDmFallbackPolling()).toBe(false);

    disconnect();
  });

  it('keeps the flag while another instance polls when an old one is disposed', () => {
    const disconnectOld = dispatch(connectDmChatStream()) as () => void;
    handlers?.onDisconnect();
    const oldHandlers = handlers;

    const disconnectNew = dispatch(connectDmChatStream()) as () => void;
    handlers?.onDisconnect();
    expect(isDmFallbackPolling()).toBe(true);

    handlers = oldHandlers;
    disconnectOld();
    expect(isDmFallbackPolling()).toBe(true);

    disconnectNew();
    expect(isDmFallbackPolling()).toBe(false);
  });

  it('disposes the poller and rethrows when connecting fails', () => {
    connectError = new Error('no access token');
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');

    expect(() => dispatch(connectDmChatStream())).toThrow('no access token');

    const addedTypes = added.mock.calls.map(([type]) => type);
    expect(addedTypes).toContain('visibilitychange');
    expect(removed.mock.calls.map(([type]) => type)).toContain(
      'visibilitychange',
    );
    expect(isDmFallbackPolling()).toBe(false);
  });
});
