import {
  MAX_RETRY_MS,
  ReconnectingSocket,
  SOCKET_CLOSED,
  SOCKET_CONNECTING,
  SOCKET_OPEN,
  STALE_AFTER_HIDDEN_MS,
  installWakeHandlers,
  retryDelay,
} from '../reconnecting_socket';

class FakeSocket {
  readyState = SOCKET_CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];
  closeCalls: number[] = [];

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {}

  send(data: string) {
    this.sent.push(data);
  }

  close(code: number) {
    this.closeCalls.push(code);
    this.readyState = SOCKET_CLOSED;
  }

  open() {
    this.readyState = SOCKET_OPEN;
    this.onopen?.();
  }

  drop(code = 1006) {
    this.readyState = SOCKET_CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }

  message(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

const nth = (sockets: FakeSocket[], index: number) => {
  const socket = sockets.at(index);
  if (!socket) throw new Error(`no socket at ${index}`);
  return socket;
};

const setup = () => {
  const sockets: FakeSocket[] = [];
  const callbacks = { onOpen: vi.fn(), onMessage: vi.fn(), onDown: vi.fn() };
  const socket = new ReconnectingSocket(
    'wss://example.test/stream',
    'token',
    callbacks,
    {
      createSocket: (url, protocols) => {
        const fake = new FakeSocket(url, protocols);
        sockets.push(fake);
        return fake as unknown as WebSocket;
      },
      random: () => 1,
    },
  );

  return { socket, sockets, callbacks, latest: () => nth(sockets, -1) };
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('retryDelay', () => {
  it('grows from about a second and never passes the cap', () => {
    expect(retryDelay(0, () => 0)).toBe(500);
    expect(retryDelay(0, () => 1)).toBe(1_000);
    expect(retryDelay(3, () => 1)).toBe(8_000);
    expect(retryDelay(50, () => 1)).toBe(MAX_RETRY_MS);
    expect(retryDelay(10_000, () => 1)).toBe(MAX_RETRY_MS);
  });
});

describe('ReconnectingSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the token as the protocol and forwards messages', () => {
    const { socket, latest, callbacks } = setup();

    expect(latest().url).toBe('wss://example.test/stream');
    expect(latest().protocols).toBe('token');

    latest().open();
    expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(SOCKET_OPEN);

    latest().message('{"event":"update"}');
    expect(callbacks.onMessage).toHaveBeenCalledWith({
      data: '{"event":"update"}',
    });

    socket.send('hello');
    expect(latest().sent).toEqual(['hello']);
  });

  it('does not send while the socket is not open', () => {
    const { socket, latest } = setup();

    socket.send('too early');

    expect(latest().sent).toEqual([]);
  });

  it('keeps retrying with a capped delay however many times it fails', () => {
    const { sockets, latest } = setup();

    for (let i = 0; i < 40; i++) {
      latest().drop();
      vi.advanceTimersByTime(MAX_RETRY_MS);
    }

    expect(sockets).toHaveLength(41);
  });

  it('reports a drop once per outage and starts counting again after it reconnects', () => {
    const { sockets, latest, callbacks } = setup();

    latest().open();
    latest().drop();
    vi.advanceTimersByTime(1_000);
    latest().drop();
    vi.advanceTimersByTime(2_000);
    latest().drop();

    expect(callbacks.onDown).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4_000);
    latest().open();
    expect(callbacks.onOpen).toHaveBeenCalledTimes(2);

    latest().drop();
    expect(callbacks.onDown).toHaveBeenCalledTimes(2);

    const before = sockets.length;
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(before);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(before + 1);
  });

  it('reports a failed first connection as a drop', () => {
    const { latest, callbacks } = setup();

    latest().drop();

    expect(callbacks.onDown).toHaveBeenCalledTimes(1);
  });

  it('does not retry on its own after the server closes it on purpose', () => {
    const { sockets, latest } = setup();

    latest().open();
    latest().drop(4000);
    vi.advanceTimersByTime(MAX_RETRY_MS * 10);

    expect(sockets).toHaveLength(1);
  });

  it('stops for good when the caller closes it', () => {
    const { socket, sockets, latest, callbacks } = setup();

    latest().open();
    socket.close();
    vi.advanceTimersByTime(MAX_RETRY_MS * 10);
    socket.wake(true);

    expect(sockets).toHaveLength(1);
    expect(latest().closeCalls).toEqual([1000]);
    expect(callbacks.onDown).not.toHaveBeenCalled();
  });

  it('wakes a waiting socket immediately and does not open a second one when the old timer fires', () => {
    const { socket, sockets, latest } = setup();

    latest().drop();
    expect(sockets).toHaveLength(1);

    socket.wake(false);
    expect(sockets).toHaveLength(2);

    vi.advanceTimersByTime(MAX_RETRY_MS * 2);
    expect(sockets).toHaveLength(2);
  });

  it('leaves a healthy socket alone on a short wake', () => {
    const { socket, sockets, latest, callbacks } = setup();

    latest().open();
    socket.wake(false);

    expect(sockets).toHaveLength(1);
    expect(callbacks.onDown).not.toHaveBeenCalled();
  });

  it('replaces a socket it no longer trusts and lets subscribers catch up', () => {
    const { socket, sockets, callbacks } = setup();
    const first = nth(sockets, 0);

    first.open();
    socket.wake(true);

    expect(first.closeCalls).toEqual([1000]);
    expect(callbacks.onDown).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
    expect(socket.readyState).toBe(SOCKET_CONNECTING);

    first.onclose?.({ code: 1006 } as CloseEvent);
    expect(callbacks.onDown).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MAX_RETRY_MS * 2);
    expect(sockets).toHaveLength(2);

    nth(sockets, 1).open();
    expect(callbacks.onOpen).toHaveBeenCalledTimes(2);
  });

  it('keeps retrying when the socket cannot even be created', () => {
    const callbacks = { onOpen: vi.fn(), onMessage: vi.fn(), onDown: vi.fn() };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;

    new ReconnectingSocket('wss://example.test/stream', 'token', callbacks, {
      createSocket: () => {
        calls += 1;
        throw new Error('blocked');
      },
      random: () => 1,
    });

    vi.advanceTimersByTime(MAX_RETRY_MS * 3);

    expect(calls).toBeGreaterThan(2);
    expect(callbacks.onDown).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('installWakeHandlers', () => {
  let now = 0;
  const target = { wake: vi.fn() };
  let uninstall: () => void;

  beforeEach(() => {
    now = 1_000_000;
    target.wake.mockReset();
    setVisibility('visible');
    uninstall = installWakeHandlers(
      () => target,
      () => now,
    );
  });

  afterEach(() => {
    uninstall();
  });

  it('wakes without distrust after a short glance away', () => {
    setVisibility('hidden');
    now += STALE_AFTER_HIDDEN_MS - 1;
    setVisibility('visible');

    expect(target.wake).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('distrusts the socket after the page was hidden for a long time', () => {
    setVisibility('hidden');
    now += 2 * 60 * 60 * 1000;
    setVisibility('visible');

    expect(target.wake).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does nothing while the page goes hidden', () => {
    setVisibility('hidden');

    expect(target.wake).not.toHaveBeenCalled();
  });

  it('wakes when the network comes back', () => {
    window.dispatchEvent(new Event('online'));

    expect(target.wake).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('distrusts the socket of a page restored from the back-forward cache', () => {
    const restored = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);

    const fresh = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(fresh, 'persisted', { value: false });
    window.dispatchEvent(fresh);

    expect(target.wake).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('uses how long the page was hidden when a frozen tab resumes', () => {
    setVisibility('hidden');
    now += STALE_AFTER_HIDDEN_MS;
    document.dispatchEvent(new Event('resume'));
    expect(target.wake).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(target.wake).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('stops listening once uninstalled', () => {
    uninstall();
    window.dispatchEvent(new Event('online'));

    expect(target.wake).not.toHaveBeenCalled();
    uninstall = () => undefined;
  });
});
