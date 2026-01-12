import SwitchLogger from './switch_logger';

const RELOAD_COUNT_KEY = '_multiAccountReloadCount';
const DEFAULT_TARGET_PATH = '/home?_switch=1';
const MAX_RELOAD_ATTEMPTS = 2;

export const getReloadCount = (): number => {
  try {
    const raw = sessionStorage.getItem(RELOAD_COUNT_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (error) {
    console.warn('Failed to read multi-account reload counter:', error);
    return 0;
  }
};

const setReloadCount = (value: number): void => {
  try {
    if (value <= 0) {
      sessionStorage.removeItem(RELOAD_COUNT_KEY);
    } else {
      sessionStorage.setItem(RELOAD_COUNT_KEY, String(value));
    }
  } catch (error) {
    console.warn('Failed to update multi-account reload counter:', error);
  }
};

const sanitizeTarget = (target?: string): string => {
  if (!target || target.trim().length === 0) {
    return DEFAULT_TARGET_PATH;
  }

  try {
    const url = new URL(target, window.location.origin);
    return url.pathname + url.search + url.hash;
  } catch (error) {
    console.warn('Invalid reload target, falling back to default:', error);
    return DEFAULT_TARGET_PATH;
  }
};

export const performHardReload = (target?: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const attempts = getReloadCount();
  if (attempts >= MAX_RELOAD_ATTEMPTS) {
    console.warn('Maximum multi-account reload attempts reached. Aborting hard reload.');
    setReloadCount(0);
    SwitchLogger.logReload(attempts);
    return;
  }

  const newCount = attempts + 1;
  setReloadCount(newCount);
  SwitchLogger.logReload(newCount);

  const nextLocation = sanitizeTarget(target);

  try {
    window.location.replace(nextLocation);
  } catch (error) {
    console.error('Failed to replace location during account switch:', error);
  }

  window.setTimeout(() => {
    try {
      window.location.reload();
    } catch (reloadError) {
      console.error('Failed to reload after account switch:', reloadError);
      setReloadCount(0);
    }
  }, 100);
};

const finalizeReloadCycle = (): void => {
  const attempts = getReloadCount();
  if (attempts <= 0) {
    return;
  }

  setReloadCount(attempts - 1);
};

if (typeof window !== 'undefined') {
  window.addEventListener(
    'load',
    () => {
      finalizeReloadCycle();
    },
    { once: true },
  );
}

