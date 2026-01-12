import { supportsPassiveEvents } from 'detect-passive-events';

const LAYOUT_BREAKPOINT = 759;

// NOTE: Finer-grained responsive behavior (e.g. 1174/759/479px) is handled via the
// `useBreakpoint` hook. Keep this module focused on the coarse layout mode (mobile vs single).

export const isMobile = (width: number) => width <= LAYOUT_BREAKPOINT;

export type LayoutType = 'mobile' | 'single-column';
export const layoutFromWindow = (): LayoutType => {
  if (isMobile(window.innerWidth)) {
    return 'mobile';
  }

  return 'single-column';
};

const listenerOptions = supportsPassiveEvents ? { passive: true } : false;

let userTouching = false;

const touchListener = () => {
  userTouching = true;

  window.removeEventListener('touchstart', touchListener);
};

window.addEventListener('touchstart', touchListener, listenerOptions);

export const isUserTouching = () => userTouching;
