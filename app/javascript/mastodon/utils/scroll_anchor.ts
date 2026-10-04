
export interface ScrollAnchor {
  id: string;
  offset: number;
}

const anchors = new Map<string, ScrollAnchor>();

export const getScrollAnchor = (key: string): ScrollAnchor | undefined =>
  anchors.get(key);

export const saveScrollAnchor = (
  key: string,
  anchor: ScrollAnchor | null,
): void => {
  if (anchor) {
    anchors.set(key, anchor);
  } else {
    anchors.delete(key);
  }
};

export const clearScrollAnchors = (): void => {
  anchors.clear();
};

const listItems = (list: HTMLElement): HTMLElement[] =>
  Array.from(list.querySelectorAll<HTMLElement>('[role="feed"] > [data-id]'));

export const findScrollAnchor = (
  list: HTMLElement,
  viewportTop: number,
): ScrollAnchor | null => {
  const item = listItems(list).find(
    (el) => el.getBoundingClientRect().bottom > viewportTop,
  );

  if (!item?.dataset.id) return null;

  return {
    id: item.dataset.id,
    offset: item.getBoundingClientRect().top - viewportTop,
  };
};

export const scrollDeltaToAnchor = (
  list: HTMLElement,
  viewportTop: number,
  anchor: ScrollAnchor,
): number | null => {
  const item = listItems(list).find((el) => el.dataset.id === anchor.id);

  if (!item) return null;

  return item.getBoundingClientRect().top - viewportTop - anchor.offset;
};

export const REMEMBERED_SCROLL_PATHS = ['/home', '/timelines/home', '/public'];

export const remembersOwnScroll = (
  prevPathname: string | undefined,
  nextPathname: string,
): boolean =>
  prevPathname !== nextPathname &&
  REMEMBERED_SCROLL_PATHS.includes(nextPathname);
