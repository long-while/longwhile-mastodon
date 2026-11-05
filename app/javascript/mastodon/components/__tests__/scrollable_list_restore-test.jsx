import { IntlProvider } from 'react-intl';

import { MemoryRouter } from 'react-router-dom';

import { Provider } from 'react-redux';

import { render } from '@testing-library/react';

import { store } from 'mastodon/store';
import {
  clearScrollAnchors,
  getScrollAnchor,
  saveScrollAnchor,
} from 'mastodon/utils/scroll_anchor';

import ScrollableList from '../scrollable_list';

// jsdom 은 배치를 계산하지 않으므로, 문서 스크롤 값과 글마다의 "문서상 위치"를
// 직접 두고 화면 좌표는 (문서상 위치 - 스크롤 값) 으로 돌려준다. 목록 자신(`.scrollable`)
// 은 문서상 `listTop` 에 있다(그 위는 칼럼 헤더).
const ITEM_HEIGHT = 300;
const scrollingElement = () => document.scrollingElement || document.body;
const layout = { scrollTop: 0, tops: {}, listTop: 100 };

// 브라우저처럼 스크롤하면 scroll 이벤트가 난다.
const scrollTo = (value) => {
  layout.scrollTop = value;
  document.dispatchEvent(new Event('scroll'));
};

// 목록 위의 무언가(칼럼 헤더)가 빠져 목록과 글 전체가 문서에서 `by` 만큼 올라간다.
// 사파리에는 스크롤 앵커링이 없어 스크롤 값은 그대로 남는다.
const collapseAboveList = (by) => {
  layout.listTop -= by;
  Object.keys(layout.tops).forEach((id) => { layout.tops[id] -= by; });
};

const listItems = (ids) =>
  ids.map((id, index) => {
    layout.tops[id] = 200 + index * ITEM_HEIGHT;
    return <div key={id}>{id}</div>;
  });

const tree = (ids) => (
  <Provider store={store}>
    <IntlProvider locale='en'>
      <MemoryRouter>
        <ScrollableList scrollKey='restore-test' bindToDocument rememberPosition trackScroll={false}>
          {listItems(ids)}
        </ScrollableList>
      </MemoryRouter>
    </IntlProvider>
  </Provider>
);

const renderList = (ids) => render(tree(ids));

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe () {}
    unobserve () {}
    disconnect () {}
  };

  // ScrollableList 와 같은 규칙으로 스크롤 요소를 고른다.
  Object.defineProperty(scrollingElement(), 'scrollTop', {
    configurable: true,
    get: () => layout.scrollTop,
    set: (value) => { layout.scrollTop = value; },
  });

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const id = this.getAttribute?.('data-id');
    let top = 0;
    if (id && id in layout.tops) top = layout.tops[id] - layout.scrollTop;
    else if (this.classList?.contains('scrollable')) top = layout.listTop - layout.scrollTop;
    return { top, bottom: top + ITEM_HEIGHT, height: ITEM_HEIGHT, left: 0, right: 0, width: 0, x: 0, y: top };
  });
});

afterAll(() => {
  vi.restoreAllMocks();
  delete scrollingElement().scrollTop;
});

beforeEach(() => {
  vi.useFakeTimers();
  clearScrollAnchors();
  layout.scrollTop = 0;
  layout.tops = {};
  layout.listTop = 100;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<ScrollableList rememberPosition />', () => {
  it('puts the remembered post back where it was', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });

    renderList(['a', 'b', 'c', 'd']);

    // c 는 문서상 800. 화면 위에서 -20 이 되려면 820 만큼 내려가 있어야 한다.
    expect(layout.scrollTop).toBe(820);
  });

  it('goes to the top instead of keeping the previous screen offset when the post is gone', () => {
    saveScrollAnchor('restore-test', { id: 'deleted', offset: 0 });
    layout.scrollTop = 700; // 직전 화면의 스크롤 값

    renderList(['a', 'b']);

    expect(layout.scrollTop).toBe(0);
  });

  it('goes to the top when nothing was remembered', () => {
    layout.scrollTop = 700;

    renderList(['a', 'b']);

    expect(layout.scrollTop).toBe(0);
  });

  it('does not yank the user back once they have scrolled', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });

    renderList(['a', 'b', 'c', 'd']);
    layout.scrollTop = 100; // 사용자가 곧바로 위로 올렸다
    vi.runAllTimers();

    expect(layout.scrollTop).toBe(100);
  });

  it('catches up when the remembered post shows up a moment later', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });
    layout.scrollTop = 700;

    // 목록이 아직 받아지는 중이다. 일단 맨 위로 가 있어야 한다.
    const { rerender } = renderList([]);
    expect(layout.scrollTop).toBe(0);

    rerender(tree(['a', 'b', 'c', 'd']));
    vi.runAllTimers();

    expect(layout.scrollTop).toBe(820);
  });

  it('remembers the post at the top edge when leaving', () => {
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    scrollTo(820);

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });

  it('forgets the position when leaving from the top, so new posts show on return', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    scrollTo(10);

    unmount();

    expect(getScrollAnchor('restore-test')).toBeUndefined();
  });

  // 사파리: 떠나는 순간 칼럼 헤더(모바일 97px)가 먼저 빠지면 글이 그만큼 올라간 채로
  // 재졌다. 돌아올 때마다 97px 씩 아래로 밀리고 탭을 오갈수록 쌓였다.
  it('measures from where the list was at rest, not where teardown pushed it', () => {
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    scrollTo(820);
    collapseAboveList(97);

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });

  // 문서가 짧아져 스크롤 값이 잘린 경우도 같다. 글은 화면상 아래로 밀려 있다.
  it('measures from where the list was at rest when the scroll value got clipped', () => {
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    scrollTo(820);
    layout.scrollTop = 300; // 이벤트 없이 잘림

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });

  it('does not forget a deep position because teardown clipped the scroll value to the top', () => {
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    scrollTo(820);
    layout.scrollTop = 0;

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });

  it('comes back to the same place over and over (tab round trips)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    let view = renderList(ids);
    scrollTo(820);

    for (let i = 0; i < 3; i += 1) {
      collapseAboveList(97);
      view.unmount();
      layout.listTop = 100;
      layout.scrollTop = 0;

      view = renderList(ids);
      vi.runAllTimers();

      expect(layout.scrollTop).toBe(820);
    }
  });

  it('keeps the place it was put back to when left without scrolling', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    vi.runAllTimers();
    collapseAboveList(97);

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });
});
