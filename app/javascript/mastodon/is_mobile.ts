import { supportsPassiveEvents } from 'detect-passive-events';

import { forceSingleColumn, hasMultiColumnPath } from './initial_state';

const LAYOUT_BREAKPOINT = 759;

// NOTE: Finer-grained responsive behavior (e.g. 1174/759/479px) is handled via the
// `useBreakpoint` hook. Keep this module focused on the coarse layout mode (mobile vs single/multi).

export const isMobile = (width: number) => width <= LAYOUT_BREAKPOINT;

export const transientSingleColumn = !forceSingleColumn && !hasMultiColumnPath;

export type LayoutType = 'mobile' | 'single-column' | 'multi-column';
export const layoutFromWindow = (): LayoutType => {
  if (isMobile(window.innerWidth)) {
    return 'mobile';
  } else if (!forceSingleColumn && !transientSingleColumn) {
    return 'multi-column';
  } else {
    return 'single-column';
  }
};

const listenerOptions = supportsPassiveEvents ? { passive: true } : false;

let userTouching = false;

const touchListener = () => {
  userTouching = true;

  window.removeEventListener('touchstart', touchListener);
};

window.addEventListener('touchstart', touchListener, listenerOptions);

export const isUserTouching = () => userTouching;
