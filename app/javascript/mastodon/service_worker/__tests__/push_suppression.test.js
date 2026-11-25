import { describe, expect, it, vi } from 'vitest';

import {
  IDLE_MS,
  MAX_CONSECUTIVE,
  collectPresence,
  isWebKitOnly,
  shouldSuppressPush,
} from '../push_suppression';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1';

const NOW = 1_000_000;

const push = (overrides = {}) => ({ account_id: '1', notification_type: 'favourite', dm_room_id: null, ...overrides });

const reply = (overrides = {}) => ({
  accountId: '1',
  path: '/home',
  hasFocus: true,
  visible: true,
  lastInteractionAt: NOW - 1_000,
  suppressEnabled: true,
  ...overrides,
});

const decide = (p, replies, context = {}) =>
  shouldSuppressPush(p, replies, NOW, { consecutive: 0, userAgent: CHROME, ...context });

describe('shouldSuppressPush', () => {
  it('suppresses while the same account is actively using a focused, visible tab', () => {
    expect(decide(push(), [reply()])).toBe(true);
  });

  it('shows it when no web app tab answered', () => {
    expect(decide(push(), [])).toBe(false);
    expect(decide(push(), [null])).toBe(false);
  });

  it('shows it when the tab is visible but not focused, or hidden', () => {
    expect(decide(push(), [reply({ hasFocus: false })])).toBe(false);
    expect(decide(push(), [reply({ visible: false })])).toBe(false);
  });

  it('shows it when the tab belongs to another account', () => {
    expect(decide(push(), [reply({ accountId: '2' })])).toBe(false);
  });

  it('shows it when the user stepped away', () => {
    expect(decide(push(), [reply({ lastInteractionAt: NOW - IDLE_MS })])).toBe(false);
  });

  it('respects the setting', () => {
    expect(decide(push(), [reply({ suppressEnabled: false })])).toBe(false);
  });

  it('shows it for an old payload without the account id', () => {
    expect(decide(push({ account_id: undefined }), [reply()])).toBe(false);
  });

  it('always shows moderation notifications', () => {
    expect(decide(push({ notification_type: 'admin.report' }), [reply()])).toBe(false);
    expect(decide(push({ notification_type: 'admin.sign_up' }), [reply()])).toBe(false);
  });

  it('suppresses a DM only while that room is open', () => {
    const dm = push({ notification_type: 'mention', dm_room_id: '7' });

    expect(decide(dm, [reply({ path: '/messages/7' })])).toBe(true);
    expect(decide(dm, [reply({ path: '/messages/8' })])).toBe(false);
    expect(decide(dm, [reply({ path: '/home' })])).toBe(false);
  });

  it('treats a favourite on a DM like the DM itself', () => {
    const dmFavourite = push({ notification_type: 'favourite', dm_room_id: '7' });

    expect(decide(dmFavourite, [reply({ path: '/home' })])).toBe(false);
    expect(decide(dmFavourite, [reply({ path: '/messages/7' })])).toBe(true);
  });

  it('shows it when the tab reports that its stream is down', () => {
    expect(decide(push(), [reply({ streamConnected: false })])).toBe(false);
  });

  it('still suppresses when the stream is connected or the old reply has no such field', () => {
    expect(decide(push(), [reply({ streamConnected: true })])).toBe(true);
    expect(decide(push(), [reply()])).toBe(true);
  });

  it('lets another connected tab cover the push even if one tab lost its stream', () => {
    expect(decide(push(), [reply({ streamConnected: false }), reply({ streamConnected: true })])).toBe(true);
  });

  it('never suppresses a legacy DM that has no room', () => {
    const legacyDm = push({ notification_type: 'mention', direct: true, dm_room_id: null });

    expect(decide(legacyDm, [reply({ path: '/home' })])).toBe(false);
    expect(decide(legacyDm, [reply({ path: '/messages' })])).toBe(false);
    expect(decide({ ...legacyDm, dm_room_id: undefined }, [reply()])).toBe(false);
  });

  it('treats a direct push that has a room like any DM', () => {
    const dm = push({ notification_type: 'mention', direct: true, dm_room_id: '7' });

    expect(decide(dm, [reply({ path: '/messages/7' })])).toBe(true);
    expect(decide(dm, [reply({ path: '/home' })])).toBe(false);
  });

  it('ignores direct: false', () => {
    expect(decide(push({ direct: false }), [reply()])).toBe(true);
  });

  it('never suppresses on WebKit-only browsers', () => {
    expect(decide(push(), [reply()], { userAgent: SAFARI })).toBe(false);
    expect(decide(push(), [reply()], { userAgent: IOS_CHROME })).toBe(false);
  });

  it('lets one through after too many in a row', () => {
    expect(decide(push(), [reply()], { consecutive: MAX_CONSECUTIVE })).toBe(false);
  });
});

describe('isWebKitOnly', () => {
  it('tells Safari and iOS browsers from Chrome', () => {
    expect(isWebKitOnly(SAFARI)).toBe(true);
    expect(isWebKitOnly(IOS_CHROME)).toBe(true);
    expect(isWebKitOnly(CHROME)).toBe(false);
  });
});

describe('collectPresence', () => {
  it('asks only focused windows and returns their answers', async () => {
    const answer = reply();
    const focused = {
      focused: true,
      postMessage: vi.fn((_message, [port]) => port.postMessage(answer)),
    };
    const background = { focused: false, postMessage: vi.fn() };

    const replies = await collectPresence({ matchAll: () => Promise.resolve([focused, background]) });

    expect(replies).toEqual([answer]);
    expect(background.postMessage).not.toHaveBeenCalled();
  });

  it('treats a silent window as no answer', async () => {
    const silent = { focused: true, postMessage: vi.fn() };

    const replies = await collectPresence({ matchAll: () => Promise.resolve([silent]) }, 10);

    expect(replies).toEqual([null]);
  });

  it('returns nothing when the windows cannot be listed', async () => {
    const replies = await collectPresence({ matchAll: () => Promise.reject(new Error('nope')) });

    expect(replies).toEqual([]);
  });
});
