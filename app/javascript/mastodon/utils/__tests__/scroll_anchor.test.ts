import {
  clearScrollAnchors,
  findScrollAnchor,
  getScrollAnchor,
  remembersOwnScroll,
  saveScrollAnchor,
  scrollDeltaToAnchor,
} from '../scroll_anchor';

const buildList = (items: { id: string; top: number; height: number }[]) => {
  const list = document.createElement('div');
  const feed = document.createElement('div');
  feed.setAttribute('role', 'feed');
  list.appendChild(feed);

  items.forEach(({ id, top, height }) => {
    const article = document.createElement('article');
    article.dataset.id = id;
    article.getBoundingClientRect = () =>
      ({ top, bottom: top + height, height }) as DOMRect;
    feed.appendChild(article);
  });

  return list;
};

describe('scroll_anchor', () => {
  afterEach(clearScrollAnchors);

  it('picks the first item still visible below the top edge', () => {
    const list = buildList([
      { id: 'a', top: -500, height: 200 },
      { id: 'b', top: -300, height: 350 },
      { id: 'c', top: 50, height: 200 },
    ]);

    expect(findScrollAnchor(list, 0)).toEqual({ id: 'b', offset: -300 });
  });

  it('measures from the top of a scrolling column, not the window', () => {
    const list = buildList([{ id: 'a', top: 140, height: 200 }]);

    expect(findScrollAnchor(list, 100)).toEqual({ id: 'a', offset: 40 });
  });

  it('works out how far to scroll to put the anchor back', () => {
    const list = buildList([
      { id: 'new', top: 0, height: 400 },
      { id: 'b', top: 400, height: 250 },
    ]);

    expect(scrollDeltaToAnchor(list, 0, { id: 'b', offset: -30 })).toBe(430);
  });

  it('gives up when the anchor is no longer in the list', () => {
    const list = buildList([{ id: 'x', top: 0, height: 100 }]);

    expect(scrollDeltaToAnchor(list, 0, { id: 'gone', offset: 0 })).toBeNull();
  });

  it('forgets an anchor when saved as null', () => {
    saveScrollAnchor('home', { id: 'a', offset: 0 });
    expect(getScrollAnchor('home')).toEqual({ id: 'a', offset: 0 });

    saveScrollAnchor('home', null);
    expect(getScrollAnchor('home')).toBeUndefined();
  });

  it('only takes over scrolling when arriving from another screen', () => {
    expect(remembersOwnScroll('/notifications', '/home')).toBe(true);
    expect(remembersOwnScroll('/home', '/public')).toBe(true);
    expect(remembersOwnScroll('/home', '/home')).toBe(false);
    expect(remembersOwnScroll('/home', '/notifications')).toBe(false);
    expect(remembersOwnScroll('/notifications', '/timelines/home')).toBe(true);
  });
});
