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

const ITEM_HEIGHT = 300;
const scrollingElement = () => document.scrollingElement || document.body;
const layout = { scrollTop: 0, tops: {} };

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

  Object.defineProperty(scrollingElement(), 'scrollTop', {
    configurable: true,
    get: () => layout.scrollTop,
    set: (value) => { layout.scrollTop = value; },
  });

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const id = this.getAttribute?.('data-id');
    const top = id && id in layout.tops ? layout.tops[id] - layout.scrollTop : 0;
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<ScrollableList rememberPosition />', () => {
  it('puts the remembered post back where it was', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });

    renderList(['a', 'b', 'c', 'd']);

    expect(layout.scrollTop).toBe(820);
  });

  it('goes to the top instead of keeping the previous screen offset when the post is gone', () => {
    saveScrollAnchor('restore-test', { id: 'deleted', offset: 0 });
    layout.scrollTop = 700;

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
    layout.scrollTop = 100;
    vi.runAllTimers();

    expect(layout.scrollTop).toBe(100);
  });

  it('catches up when the remembered post shows up a moment later', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });
    layout.scrollTop = 700;

    const { rerender } = renderList([]);
    expect(layout.scrollTop).toBe(0);

    rerender(tree(['a', 'b', 'c', 'd']));
    vi.runAllTimers();

    expect(layout.scrollTop).toBe(820);
  });

  it('remembers the post at the top edge when leaving', () => {
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    layout.scrollTop = 820;

    unmount();

    expect(getScrollAnchor('restore-test')).toEqual({ id: 'c', offset: -20 });
  });

  it('forgets the position when leaving from the top, so new posts show on return', () => {
    saveScrollAnchor('restore-test', { id: 'c', offset: -20 });
    const { unmount } = renderList(['a', 'b', 'c', 'd']);
    layout.scrollTop = 10;

    unmount();

    expect(getScrollAnchor('restore-test')).toBeUndefined();
  });
});
