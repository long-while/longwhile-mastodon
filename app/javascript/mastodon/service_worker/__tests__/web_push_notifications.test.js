import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONSECUTIVE } from '../push_suppression';
import { handlePush } from '../web_push_notifications';

vi.mock('virtual:mastodon-sw-locales', () => ({
  default: {
    en: {
      'notification.favourite': '{name} favourited your status',
      'notification.follow': '{name} followed you',
      'notification.mention': '{name} mentioned you',
      'notifications.group': '{count} new notifications',
      'status.show_more': 'Show more',
      'status.reblog': 'Boost',
      'status.favourite': 'Favorite',
    },
  },
}));

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';
const COUNTER_KEY = '/__push_suppressed_count';

const pushData = (overrides = {}) => ({
  access_token: 'token',
  notification_id: '10',
  preferred_locale: 'en',
  title: 'fallback title',
  body: 'fallback body',
  icon: '/icon.png',
  account_id: '1',
  notification_type: 'favourite',
  dm_room_id: null,
  ...overrides,
});

const apiNotification = (overrides = {}) => ({
  id: '10',
  type: 'favourite',
  created_at: '2026-01-01T00:00:00.000Z',
  account: { id: '2', acct: 'bob', username: 'bob', display_name: 'Bob', avatar_static: '/bob.png' },
  status: {
    id: '99',
    content: '<p>hello</p>',
    spoiler_text: '',
    sensitive: false,
    media_attachments: [],
    account: { acct: 'alice' },
  },
  ...overrides,
});

const createCaches = () => {
  const store = new Map();
  const cache = {
    match: (key) => Promise.resolve(store.has(key) ? new Response(store.get(key)) : undefined),
    put: async (key, response) => {
      store.set(key, await response.text());
    },
  };

  return { store, storage: { open: vi.fn(() => Promise.resolve(cache)) } };
};

const focusedClient = (reply) => ({
  focused: true,
  postMessage: vi.fn((_message, [port]) => port.postMessage(reply)),
});

const activeReply = (overrides = {}) => ({
  accountId: '1',
  path: '/home',
  hasFocus: true,
  visible: true,
  lastInteractionAt: Date.now(),
  suppressEnabled: true,
  streamConnected: true,
  ...overrides,
});

const runPush = async (push) => {
  let pending;
  const event = {
    data: { json: () => push },
    waitUntil: (promise) => {
      pending = promise;
    },
  };

  handlePush(event);
  await pending;
};

describe('handlePush', () => {
  let showNotification;
  let clientList;
  let cacheState;
  let notificationResponse;

  beforeEach(() => {
    showNotification = vi.fn(() => Promise.resolve());
    clientList = [];
    cacheState = createCaches();
    notificationResponse = apiNotification();

    self.registration = {
      showNotification,
      getNotifications: vi.fn(() => Promise.resolve([])),
    };
    self.clients = { matchAll: vi.fn(() => Promise.resolve(clientList)) };

    vi.stubGlobal('caches', cacheState.storage);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(notificationResponse),
    })));
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not show a suppressed push and counts it', async () => {
    clientList = [focusedClient(activeReply())];

    await runPush(pushData());

    expect(showNotification).not.toHaveBeenCalled();
    expect(cacheState.store.get(COUNTER_KEY)).toBe('1');
  });

  it('shows an unsuppressed push and resets the counter', async () => {
    cacheState.store.set(COUNTER_KEY, '3');

    await runPush(pushData());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0][0]).toBe('Bob favourited your status');
    expect(cacheState.store.get(COUNTER_KEY)).toBe('0');
  });

  it('shows the push when the cache cannot be opened', async () => {
    clientList = [focusedClient(activeReply())];
    cacheState.storage.open.mockRejectedValue(new Error('quota'));

    await runPush(pushData());

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('lets the sixth consecutive push through', async () => {
    clientList = [focusedClient(activeReply())];

    for (let i = 0; i < MAX_CONSECUTIVE; i += 1) {
      await runPush(pushData());
    }

    expect(showNotification).not.toHaveBeenCalled();
    expect(cacheState.store.get(COUNTER_KEY)).toBe(String(MAX_CONSECUTIVE));

    await runPush(pushData());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(cacheState.store.get(COUNTER_KEY)).toBe('0');
  });

  it('shows the push when the focused tab reports that its stream is down', async () => {
    clientList = [focusedClient(activeReply({ streamConnected: false }))];

    await runPush(pushData());

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('shows a legacy room-less DM even while the app is in use', async () => {
    clientList = [focusedClient(activeReply())];

    await runPush(pushData({ notification_type: 'mention', direct: true }));

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('shows a follow notification that has no status without throwing', async () => {
    notificationResponse = apiNotification({ type: 'follow', status: null });

    await runPush(pushData({ notification_type: 'follow' }));

    expect(showNotification).toHaveBeenCalledTimes(1);

    const [title, options] = showNotification.mock.calls[0];

    expect(title).toBe('Bob followed you');
    expect(options.data.url).toBe('/@bob');
    expect(options.actions).toBeUndefined();
  });
});
