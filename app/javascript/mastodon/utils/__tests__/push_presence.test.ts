import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PushPresence } from '../push_presence';

vi.mock('mastodon/initial_state', () => ({ me: '1' }));

type MessageHandler = (event: Event) => void;

const createServiceWorkerContainer = () => {
  const handlers: MessageHandler[] = [];

  return {
    handlers,
    addEventListener: vi.fn((type: string, handler: MessageHandler) => {
      if (type === 'message') handlers.push(handler);
    }),
  };
};

const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

const loadModule = async () => {
  vi.resetModules();
  return import('../push_presence');
};

const sendMessage = (
  container: ReturnType<typeof createServiceWorkerContainer>,
  data: unknown,
  ports: { postMessage: ReturnType<typeof vi.fn> }[],
) => {
  const event = Object.assign(new Event('message'), { data, ports });
  container.handlers.forEach((handler) => {
    handler(event);
  });
};

const askPresence = (
  container: ReturnType<typeof createServiceWorkerContainer>,
) => {
  const port = { postMessage: vi.fn() };
  sendMessage(container, { type: 'ma:presence?' }, [port]);
  return port;
};

describe('installPushPresenceResponder', () => {
  let container: ReturnType<typeof createServiceWorkerContainer>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    container = createServiceWorkerContainer();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('answers on the message port with the page state', async () => {
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => true,
      () => true,
    );

    const port = askPresence(container);

    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({
      accountId: '1',
      path: window.location.pathname,
      hasFocus: true,
      visible: true,
      lastInteractionAt: NOW,
      suppressEnabled: true,
      streamConnected: true,
    } satisfies PushPresence);
  });

  it('reports the current setting and stream state on every request', async () => {
    let suppress = true;
    let connected = true;
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => suppress,
      () => connected,
    );

    suppress = false;
    connected = false;
    const first = askPresence(container);

    expect(first.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressEnabled: false,
        streamConnected: false,
      }),
    );

    suppress = true;
    connected = true;
    const second = askPresence(container);

    expect(second.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ suppressEnabled: true, streamConnected: true }),
    );
  });

  it('reports a page that is not focused or not visible', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => true,
      () => true,
    );

    const port = askPresence(container);

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ hasFocus: false, visible: false }),
    );
  });

  it('ignores other message types and requests without a port', async () => {
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => true,
      () => true,
    );

    const port = { postMessage: vi.fn() };
    sendMessage(container, { type: 'something-else' }, [port]);
    sendMessage(container, null, [port]);
    sendMessage(container, 'ma:presence?', [port]);
    sendMessage(container, { type: 'ma:presence?' }, []);

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('tracks the last interaction time', async () => {
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => true,
      () => true,
    );

    vi.setSystemTime(NOW + 60_000);
    window.dispatchEvent(new Event('keydown'));

    const port = askPresence(container);

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ lastInteractionAt: NOW + 60_000 }),
    );
  });

  it('installs only once', async () => {
    const { installPushPresenceResponder } = await loadModule();
    installPushPresenceResponder(
      () => true,
      () => true,
    );
    installPushPresenceResponder(
      () => false,
      () => false,
    );

    const port = askPresence(container);

    expect(container.addEventListener).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ suppressEnabled: true }),
    );
  });

  it('does nothing without service worker support', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const { installPushPresenceResponder } = await loadModule();

    expect(() => {
      installPushPresenceResponder(
        () => true,
        () => true,
      );
    }).not.toThrow();
  });
});
