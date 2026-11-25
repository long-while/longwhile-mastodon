export type PollResult = 'ok' | 'error' | 'stop';

export interface FallbackPollerOptions {
  poll: () => Promise<PollResult>;
  firstDelayMin?: number;
  firstDelayMax?: number;
  baseInterval?: number;
  maxInterval?: number;
  jitter?: number;
  random?: () => number;
  isHidden?: () => boolean;
  onVisible?: (listener: () => void) => () => void;
  onStateChange?: (running: boolean) => void;
}

export interface FallbackPoller {
  start: () => void;
  stop: () => void;
  dispose: () => void;
  isRunning: () => boolean;
}

const defaultIsHidden = () =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

const defaultOnVisible = (listener: () => void) => {
  if (typeof document === 'undefined') return () => undefined;

  const handler = () => {
    if (document.visibilityState === 'visible') listener();
  };

  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
};

export const createFallbackPoller = ({
  poll,
  firstDelayMin = 15_000,
  firstDelayMax = 30_000,
  baseInterval = 30_000,
  maxInterval = 120_000,
  jitter = 0.2,
  random = Math.random,
  isHidden = defaultIsHidden,
  onVisible = defaultOnVisible,
  onStateChange,
}: FallbackPollerOptions): FallbackPoller => {
  let running = false;
  let disposed = false;
  let polling = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setRunning = (next: boolean) => {
    if (running === next) return;

    running = next;
    onStateChange?.(next);
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const nextInterval = () => {
    const backedOff = Math.min(baseInterval * 2 ** failures, maxInterval);
    return Math.round(backedOff * (1 - jitter + random() * 2 * jitter));
  };

  const schedule = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, delay);
  };

  const tick = async () => {
    if (!running || polling) return;

    if (isHidden()) {
      schedule(nextInterval());
      return;
    }

    polling = true;
    let result: PollResult;

    try {
      result = await poll();
    } catch {
      result = 'error';
    } finally {
      polling = false;
    }

    if (!running) return;

    if (result === 'stop') {
      setRunning(false);
      return;
    }

    failures = result === 'error' ? failures + 1 : 0;
    schedule(nextInterval());
  };

  const removeVisibleListener = onVisible(() => {
    if (running && timer !== null) {
      clearTimer();
      void tick();
    }
  });

  return {
    start() {
      if (disposed || running) return;

      setRunning(true);
      failures = 0;
      schedule(
        Math.round(firstDelayMin + random() * (firstDelayMax - firstDelayMin)),
      );
    },
    stop() {
      setRunning(false);
      clearTimer();
    },
    dispose() {
      setRunning(false);
      disposed = true;
      clearTimer();
      removeVisibleListener();
    },
    isRunning: () => running,
  };
};
