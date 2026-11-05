import { useCallback, useEffect } from 'react';

export const SHOW_AFTER_SCROLL_UP = 150;
export const HIDE_AFTER_SCROLL_DOWN = 8;

export const HIDDEN_CLASS = 'tabs-bar__wrapper--hidden';

interface State {
  lastY: number;
  down: number;
  up: number;
  hidden: boolean;
}

export const nextHeaderState = (
  state: State,
  y: number,
  headerHeight: number,
): State => {
  const delta = y - state.lastY;

  if (y <= headerHeight) {
    return { lastY: y, down: 0, up: 0, hidden: false };
  }

  if (delta > 0) {
    const down = state.down + delta;
    return {
      lastY: y,
      down,
      up: 0,
      hidden: state.hidden || down >= HIDE_AFTER_SCROLL_DOWN,
    };
  }

  if (delta < 0) {
    const up = state.up - delta;
    return {
      lastY: y,
      down: 0,
      up,
      hidden: state.hidden && up < SHOW_AFTER_SCROLL_UP,
    };
  }

  return state;
};

interface Options {
  className: string;
  topZone: (target: HTMLElement) => number;
}

const useScrollDirectionClass = (
  resolveTarget: () => HTMLElement | null | undefined,
  enabled: boolean,
  { className, topZone }: Options,
) => {
  useEffect(() => {
    const target = resolveTarget();
    if (!enabled || !target) return undefined;

    let state: State = { lastY: window.scrollY, down: 0, up: 0, hidden: false };
    let frame: number | null = null;

    const apply = () => {
      frame = null;
      state = nextHeaderState(state, window.scrollY, topZone(target));
      target.classList.toggle(className, state.hidden);
    };

    const handleScroll = () => {
      frame ??= window.requestAnimationFrame(apply);
    };

    const handleFocusIn = () => {
      state = { ...state, up: 0, down: 0, hidden: false };
      target.classList.remove(className);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    target.addEventListener('focusin', handleFocusIn);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      target.removeEventListener('focusin', handleFocusIn);
      target.classList.remove(className);
    };
  }, [resolveTarget, enabled, className, topZone]);
};

const wrapperHeight = (target: HTMLElement) => target.offsetHeight;

export const useHideOnScroll = (
  anchor: React.RefObject<HTMLElement>,
  enabled: boolean,
) => {
  const resolveTarget = useCallback(
    () => anchor.current?.closest<HTMLElement>('.tabs-bar__wrapper'),
    [anchor],
  );

  useScrollDirectionClass(resolveTarget, enabled, {
    className: HIDDEN_CLASS,
    topZone: wrapperHeight,
  });
};

export const DIMMED_CLASS = 'ui__navigation-bar--dimmed';

const barHeight = (target: HTMLElement) => target.offsetHeight;

export const useDimOnScroll = (bar: React.RefObject<HTMLElement>) => {
  const resolveTarget = useCallback(() => bar.current, [bar]);

  useScrollDirectionClass(resolveTarget, true, {
    className: DIMMED_CLASS,
    topZone: barHeight,
  });
};
