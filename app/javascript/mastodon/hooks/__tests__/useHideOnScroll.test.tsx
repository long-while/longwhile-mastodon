import { useRef } from 'react';

import { act, render } from '@testing-library/react';

import {
  DIMMED_CLASS,
  HIDDEN_CLASS,
  nextHeaderState,
  useDimOnScroll,
  useHideOnScroll,
} from '../useHideOnScroll';

const HEADER = 96;
const start = { lastY: 0, down: 0, up: 0, hidden: false };

const scrollThrough = (ys: number[]) =>
  ys.reduce((state, y) => nextHeaderState(state, y, HEADER), start);

describe('nextHeaderState', () => {
  it('stays visible near the top', () => {
    expect(scrollThrough([40, 90]).hidden).toBe(false);
  });

  it('ignores a tiny nudge down but hides after a real scroll down', () => {
    expect(scrollThrough([200, 205]).hidden).toBe(true);
    expect(scrollThrough([200, 400, 405]).hidden).toBe(true);
    expect(nextHeaderState({ ...start, lastY: 300 }, 304, HEADER).hidden).toBe(
      false,
    );
  });

  it('needs a good scroll up to come back', () => {
    const hidden = scrollThrough([500, 1000]);

    expect(nextHeaderState(hidden, 900, HEADER).hidden).toBe(true);
    expect(nextHeaderState(hidden, 850, HEADER).hidden).toBe(false);
  });

  it('starts counting again when the direction changes', () => {
    expect(scrollThrough([500, 1000, 900, 910, 810]).hidden).toBe(true);
  });

  it('always shows again once back near the top', () => {
    expect(scrollThrough([500, 1000, 50]).hidden).toBe(false);
  });
});

const Header = () => {
  const ref = useRef<HTMLSpanElement>(null);
  useHideOnScroll(ref, true);
  return (
    <div className='tabs-bar__wrapper'>
      <span ref={ref} />
    </div>
  );
};

const Bar = () => {
  const ref = useRef<HTMLDivElement>(null);
  useDimOnScroll(ref);
  return <div className='ui__navigation-bar' ref={ref} />;
};

let frames: FrameRequestCallback[] = [];

const scrollTo = (y: number) => {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    const due = frames;
    frames = [];
    due.forEach((cb) => {
      cb(0);
    });
  });
};

describe('useHideOnScroll / useDimOnScroll', () => {
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    scrollTo(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('slides the header away on the way down and back on a good scroll up', () => {
    const { container } = render(<Header />);
    const wrapper = container.querySelector('.tabs-bar__wrapper');

    scrollTo(600);
    expect(wrapper?.classList.contains(HIDDEN_CLASS)).toBe(true);

    scrollTo(550);
    expect(wrapper?.classList.contains(HIDDEN_CLASS)).toBe(true);

    scrollTo(300);
    expect(wrapper?.classList.contains(HIDDEN_CLASS)).toBe(false);
  });

  it('dims the bottom bar while scrolling down', () => {
    const { container } = render(<Bar />);
    const bar = container.querySelector('.ui__navigation-bar');

    scrollTo(600);
    expect(bar?.classList.contains(DIMMED_CLASS)).toBe(true);

    scrollTo(0);
    expect(bar?.classList.contains(DIMMED_CLASS)).toBe(false);
  });

  it('does not leave the header hidden for the next screen', () => {
    const { container, unmount } = render(<Header />);
    const wrapper = container.querySelector('.tabs-bar__wrapper');

    scrollTo(600);
    const stillAttached = wrapper;
    unmount();

    expect(stillAttached?.classList.contains(HIDDEN_CLASS)).toBe(false);
  });
});
