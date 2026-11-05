// @_longwhile — 타임라인을 떠났다 돌아와도 읽던 글부터 다시 보이게 한다.
//
//   픽셀이 아니라 **"화면 맨 위에 걸쳐 있던 글"과 그 글의 위치**를 기억한다.
//   자리를 비운 사이 새 글이 위에 끼면 픽셀 값은 엉뚱한 곳을 가리키지만, 글을
//   기준으로 잡으면 그대로 맞는다. X 가 같은 방식이다(탭을 오가거나 다른 화면에
//   다녀와도 같은 글이 같은 자리에 온다. 새로고침하면 맨 위로 간다).
//
//   메모리에만 둔다. 새로고침하면 타임라인 데이터부터 사라지므로, 그 글을 다시
//   찾을 수도 없다.

export interface ScrollAnchor {
  id: string;
  // 스크롤 영역 위쪽 끝에서 그 글의 위쪽 끝까지의 거리. 화면 위로 일부 올라가
  // 있으면 음수다.
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

// `viewportTop` 은 스크롤 영역 위쪽 끝의 화면 좌표다. 문서 전체가 스크롤하면 0.
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

// 기준 글을 그 자리에 다시 놓으려면 스크롤을 얼마나 옮겨야 하는지. 글이
// 목록에 없으면(지워졌거나 잘려 나갔으면) null.
export const scrollDeltaToAnchor = (
  list: HTMLElement,
  viewportTop: number,
  anchor: ScrollAnchor,
): number | null => {
  const item = listItems(list).find((el) => el.dataset.id === anchor.id);

  if (!item) return null;

  return item.getBoundingClientRect().top - viewportTop - anchor.offset;
};

// 스스로 위치를 되돌리는 화면들. 라우터의 "새 화면이면 맨 위로" 를 여기서는
// 끈다(`mastodon.jsx` 의 `shouldUpdateScroll`). 끄지 않으면 되돌린 직후에
// 라우터가 맨 위로 다시 올려 버린다.
//
// 이 목록에 넣는 화면은 반드시 `ScrollableList` 에 `rememberPosition` 을 줘야
// 한다. 안 주면 직전 화면의 스크롤 값이 그대로 남는다.
// `/timelines/home` 은 홈의 옛 주소다. 같은 화면을 그리므로 함께 둔다.
export const REMEMBERED_SCROLL_PATHS = ['/home', '/timelines/home', '/public'];

// 다른 화면에서 들어올 때만 해당한다. 같은 화면에서 같은 주소로 다시 가는 것
// (하단 막대의 홈을 한 번 더 누르기)은 지금처럼 맨 위로 올린다.
export const remembersOwnScroll = (
  prevPathname: string | undefined,
  nextPathname: string,
): boolean =>
  prevPathname !== nextPathname &&
  REMEMBERED_SCROLL_PATHS.includes(nextPathname);
