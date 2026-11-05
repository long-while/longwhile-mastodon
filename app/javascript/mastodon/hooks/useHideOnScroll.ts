import { useCallback, useEffect } from 'react';

// 이만큼 위로 올려야 다시 내려온다. 조금 움직인 것으로는 나오지 않는다.
export const SHOW_AFTER_SCROLL_UP = 150;
// 아래로 이만큼은 움직여야 숨긴다. 손가락 떨림으로 깜빡이지 않게.
export const HIDE_AFTER_SCROLL_DOWN = 8;

export const HIDDEN_CLASS = 'tabs-bar__wrapper--hidden';

interface State {
  lastY: number;
  down: number;
  up: number;
  hidden: boolean;
}

// 스크롤 한 번마다 숨길지 정한다. 순수 함수라 테스트에서 그대로 부른다.
//   * 헤더 높이보다 위(맨 위 근처)에서는 항상 보인다.
//   * 아래로 `HIDE_AFTER_SCROLL_DOWN` 이상 가면 숨는다.
//   * 위로 `SHOW_AFTER_SCROLL_UP` 이상 모아서 올리면 다시 보인다. 방향이
//     바뀌면 반대쪽 누적은 0 부터 다시 센다.
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
  // 스크롤 중 숨길 때(아래로 가는 중) 붙일 클래스.
  className: string;
  // 이보다 위(px)에서는 늘 보인다.
  topZone: (target: HTMLElement) => number;
}

// 스크롤 방향에 따라 `target` 에 클래스를 붙였다 뗀다. 실제로 움직이거나
// 흐려지는 것은 CSS 다. 상태를 React 가 아니라 클래스로 들고 있는 것은 스크롤
// 마다 다시 그리지 않기 위해서다.
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

    // 키보드로 들어오면 숨어 있거나 흐려져 있을 수 없다.
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
      // 다른 화면에서 숨은 채로 시작하지 않게.
      target.classList.remove(className);
    };
  }, [resolveTarget, enabled, className, topZone]);
};

const wrapperHeight = (target: HTMLElement) => target.offsetHeight;

// @_longwhile — 홈·퍼블릭의 헤더(로고 줄 + 탭 줄)를 X 처럼 스크롤에 따라
//   올리고 내린다. 헤더를 담고 있는 붙박이 상자(`.tabs-bar__wrapper`)에
//   클래스만 붙이고, 움직이는 것은 CSS 다 — 그것도 모바일에서만
//   (components.scss). 넓은 화면에서는 클래스가 붙어도 아무 일도 없다.
//
//   `anchor` 는 헤더 안의 아무 요소다. 칼럼 헤더는 그 상자로 포털되므로
//   거기서 `closest()` 로 찾는다. 다중 칼럼에는 그 상자가 없어 아무것도 안 한다.
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

// 하단 막대는 헤더와 달리 모든 화면에 있다. 맨 위 근처의 기준은 막대 높이만큼.
const barHeight = (target: HTMLElement) => target.offsetHeight;

// @_longwhile — 아래로 스크롤하는 동안 하단 막대를 흐리게 한다(X 와 같다).
//   다시 또렷해지는 조건은 헤더가 다시 내려오는 조건과 같다.
export const useDimOnScroll = (bar: React.RefObject<HTMLElement>) => {
  const resolveTarget = useCallback(() => bar.current, [bar]);

  useScrollDirectionClass(resolveTarget, true, {
    className: DIMMED_CLASS,
    topZone: barHeight,
  });
};
