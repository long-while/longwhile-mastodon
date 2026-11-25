import {
  cleanupCallbackHandler,
  initializeCallbackHandler,
  openOAuthPopup,
} from '../callback_handler';

type FakePopup = Window & {
  postMessage: ReturnType<typeof vi.fn>;
};

const fakePopup = () =>
  ({
    closed: false,
    close: vi.fn(),
    postMessage: vi.fn(),
    location: { href: 'about:blank' },
  }) as unknown as FakePopup;

const send = (
  data: unknown,
  source: unknown,
  origin = window.location.origin,
) => {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
};

const track = (promise: Promise<unknown>) => {
  const outcome = { settled: false, value: undefined as unknown };

  promise.then(
    (value) => {
      outcome.settled = true;
      outcome.value = value;
    },
    (error: unknown) => {
      outcome.settled = true;
      outcome.value = error;
    },
  );

  return outcome;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('multi-account callback handler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    initializeCallbackHandler();
  });

  afterEach(() => {
    cleanupCallbackHandler();
    vi.restoreAllMocks();
  });

  it('accepts the code from the popup we opened and asks it to close', async () => {
    const popup = fakePopup();
    const outcome = track(openOAuthPopup('/oauth/authorize', 's1', popup));

    send({ type: 'multi-account-callback', state: 's1', code: 'c1' }, popup);
    await flush();

    expect(outcome.value).toEqual({ state: 's1', code: 'c1' });
    expect(popup.postMessage).toHaveBeenCalledWith(
      { type: 'multi-account-close-popup' },
      window.location.origin,
    );
  });

  it('ignores a callback from another window with the same origin', async () => {
    const popup = fakePopup();
    const outcome = track(openOAuthPopup('/oauth/authorize', 's1', popup));

    send(
      { type: 'multi-account-callback', state: 's1', code: 'stolen' },
      fakePopup(),
    );
    await flush();

    expect(outcome.settled).toBe(false);
  });

  it('ignores a callback that has no source window', async () => {
    const popup = fakePopup();
    const outcome = track(openOAuthPopup('/oauth/authorize', 's1', popup));

    send({ type: 'multi-account-callback', state: 's1', code: 'c' }, null);
    await flush();

    expect(outcome.settled).toBe(false);
  });

  it('compares the whole origin, not only the hostname', async () => {
    const popup = fakePopup();
    const outcome = track(openOAuthPopup('/oauth/authorize', 's1', popup));
    const { protocol, hostname } = window.location;
    const otherScheme = protocol === 'https:' ? 'http:' : 'https:';

    send(
      { type: 'multi-account-callback', state: 's1', code: 'c' },
      popup,
      `${otherScheme}//${hostname}`,
    );
    send(
      { type: 'multi-account-callback', state: 's1', code: 'c' },
      popup,
      `${protocol}//${hostname}:65000`,
    );
    await flush();

    expect(outcome.settled).toBe(false);
  });

  it('rejects only the requests of the popup that reported an error without a state', async () => {
    const first = fakePopup();
    const second = fakePopup();
    const firstOutcome = track(openOAuthPopup('/a', 's1', first));
    const secondOutcome = track(openOAuthPopup('/b', 's2', second));

    send({ type: 'multi-account-error', error: 'denied' }, first);
    await flush();

    expect(firstOutcome.settled).toBe(true);
    expect(firstOutcome.value).toBeInstanceOf(Error);
    expect(secondOutcome.settled).toBe(false);
  });

  it('ignores messages without an object payload', async () => {
    const popup = fakePopup();
    const outcome = track(openOAuthPopup('/oauth/authorize', 's1', popup));

    send(null, popup);
    send('text', popup);
    await flush();

    expect(outcome.settled).toBe(false);
  });
});
