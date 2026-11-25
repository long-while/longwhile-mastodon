import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PollResult } from '../util/fallback_poller';
import { createFallbackPoller } from '../util/fallback_poller';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('createFallbackPoller', () => {
  let hidden: boolean;
  let visibleListener: (() => void) | null;
  let poll: ReturnType<typeof vi.fn<() => Promise<PollResult>>>;

  const make = (onStateChange?: (running: boolean) => void) =>
    createFallbackPoller({
      poll,
      onStateChange,
      random: () => 0.5, // no jitter, first delay = 22.5s
      isHidden: () => hidden,
      onVisible: (listener) => {
        visibleListener = listener;
        return () => {
          visibleListener = null;
        };
      },
    });

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    visibleListener = null;
    poll = vi.fn<() => Promise<PollResult>>().mockResolvedValue('ok');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts polling some time after the stream drops, then every 30 seconds', async () => {
    const poller = make();
    poller.start();

    await vi.advanceTimersByTimeAsync(22_000);
    expect(poll).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('stops when the stream comes back', async () => {
    const poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(23_000);

    poller.stop();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('never starts again once disposed', async () => {
    const poller = make();
    poller.dispose();
    poller.start();

    await vi.advanceTimersByTimeAsync(300_000);

    expect(poll).not.toHaveBeenCalled();
    expect(visibleListener).toBeNull();
  });

  it('skips requests while the tab is hidden and checks at once when it is shown again', async () => {
    hidden = true;
    const poller = make();
    poller.start();

    await vi.advanceTimersByTimeAsync(100_000);
    expect(poll).not.toHaveBeenCalled();

    hidden = false;
    visibleListener?.();
    await flush();

    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('backs off on failures up to two minutes', async () => {
    poll.mockResolvedValue('error');
    const poller = make();
    poller.start();

    await vi.advanceTimersByTimeAsync(22_500); // 1st
    await vi.advanceTimersByTimeAsync(60_000); // 2nd after 60s
    expect(poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(119_000);
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000); // 3rd after 120s
    expect(poll).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(120_000); // capped at 120s
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('stops for good when the session is gone', async () => {
    poll.mockResolvedValue('stop');
    const poller = make();
    poller.start();

    await vi.advanceTimersByTimeAsync(23_000);
    await vi.advanceTimersByTimeAsync(300_000);

    expect(poll).toHaveBeenCalledTimes(1);
    expect(poller.isRunning()).toBe(false);
  });

  it('reports every change of the running state, including a stop it caused itself', async () => {
    const changes: boolean[] = [];
    poll.mockResolvedValue('stop');
    const poller = make((running) => changes.push(running));

    poller.start();
    poller.start();
    expect(changes).toEqual([true]);

    await vi.advanceTimersByTimeAsync(23_000);
    expect(changes).toEqual([true, false]);

    poller.stop();
    poller.dispose();
    expect(changes).toEqual([true, false]);
  });

  it('reports a stop and a dispose only once each', () => {
    const changes: boolean[] = [];
    const poller = make((running) => changes.push(running));

    poller.start();
    poller.stop();
    poller.start();
    poller.dispose();

    expect(changes).toEqual([true, false, true, false]);
  });
});
