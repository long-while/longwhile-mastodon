import PropTypes from 'prop-types';
import { Children, cloneElement, PureComponent } from 'react';

import classNames from 'classnames';
import { useLocation } from 'react-router-dom';

import { List as ImmutableList } from 'immutable';
import { connect } from 'react-redux';

import { supportsPassiveEvents } from 'detect-passive-events';
import { throttle } from 'lodash';

import ScrollContainer from 'mastodon/containers/scroll_container';
import { getScrollAnchor, saveScrollAnchor, findScrollAnchor, scrollDeltaToAnchor } from 'mastodon/utils/scroll_anchor';

import IntersectionObserverArticleContainer from '../containers/intersection_observer_article_container';
import { attachFullscreenListener, detachFullscreenListener, isFullscreen } from '../features/ui/util/fullscreen';
import IntersectionObserverWrapper from '../features/ui/util/intersection_observer_wrapper';

import { LoadMore } from './load_more';
import { LoadPending } from './load_pending';
import { LoadingIndicator } from './loading_indicator';

const MOUSE_IDLE_DELAY = 300;

// 이보다 위에 있으면 "맨 위에서 보고 있었다" 고 본다. `onScrollToTop` 과 같은 값.
const TOP_THRESHOLD = 100;

// 위치를 되돌린 뒤 이미지 등이 자리를 잡으면서 높이가 바뀌므로, 사용자가 손대지
// 않았으면 이 시점들에 한 번 더 맞춘다.
const ANCHOR_SETTLE_DELAYS = [0, 150, 500];

const listenerOptions = supportsPassiveEvents ? { passive: true } : false;

/**
 *
 * @param {import('mastodon/store').RootState} state
 * @param {*} props
 */
const mapStateToProps = (state, { scrollKey }) => {
  return {
    preventScroll: scrollKey === state.dropdownMenu.scrollKey,
  };
};

// This component only exists to be able to call useLocation()
const IOArticleContainerWrapper = ({id, index, listLength, intersectionObserverWrapper, trackScroll, scrollKey, children}) => {
  const location = useLocation();

  return (<IntersectionObserverArticleContainer
    id={id}
    index={index}
    listLength={listLength}
    intersectionObserverWrapper={intersectionObserverWrapper}
    saveHeightKey={trackScroll ? `${location.key}:${scrollKey}` : null}
  >
    {children}
  </IntersectionObserverArticleContainer>);
};

IOArticleContainerWrapper.propTypes =  {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  index: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  listLength: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  scrollKey: PropTypes.string.isRequired,
  intersectionObserverWrapper: PropTypes.object.isRequired,
  trackScroll: PropTypes.bool.isRequired,
  children: PropTypes.node,
};

class ScrollableList extends PureComponent {

  static propTypes = {
    scrollKey: PropTypes.string.isRequired,
    onLoadMore: PropTypes.func,
    onLoadPending: PropTypes.func,
    onScrollToTop: PropTypes.func,
    onScroll: PropTypes.func,
    trackScroll: PropTypes.bool,
    isLoading: PropTypes.bool,
    showLoading: PropTypes.bool,
    hasMore: PropTypes.bool,
    numPending: PropTypes.number,
    prepend: PropTypes.node,
    append: PropTypes.node,
    alwaysPrepend: PropTypes.bool,
    emptyMessage: PropTypes.node,
    children: PropTypes.node,
    bindToDocument: PropTypes.bool,
    preventScroll: PropTypes.bool,
    footer: PropTypes.node,
    className: PropTypes.string,
    // 떠났다 돌아왔을 때 읽던 글부터 보이게 한다(utils/scroll_anchor.ts).
    // 켜는 화면은 utils/scroll_anchor.ts 의 `REMEMBERED_SCROLL_PATHS` 에도 있어야 한다.
    rememberPosition: PropTypes.bool,
  };

  static defaultProps = {
    trackScroll: true,
  };

  state = {
    fullscreen: null,
    cachedMediaWidth: 250, // Default media/card width using default Mastodon theme
  };

  intersectionObserverWrapper = new IntersectionObserverWrapper();

  handleScroll = throttle(() => {
    if (this.node) {
      const scrollTop = this.getScrollTop();
      const scrollHeight = this.getScrollHeight();
      const clientHeight = this.getClientHeight();
      const offset = scrollHeight - scrollTop - clientHeight;

      if (scrollTop > 0 && offset < 400 && this.props.onLoadMore && this.props.hasMore && !this.props.isLoading) {
        this.props.onLoadMore();
      }

      if (scrollTop < 100 && this.props.onScrollToTop) {
        this.props.onScrollToTop();
      } else if (this.props.onScroll) {
        this.props.onScroll();
      }

      if (!this.lastScrollWasSynthetic) {
        // If the last scroll wasn't caused by setScrollTop(), assume it was
        // intentional and cancel any pending scroll reset on mouse idle
        this.scrollToTopOnMouseIdle = false;
      }
      this.lastScrollWasSynthetic = false;
    }
  }, 150, {
    trailing: true,
  });

  mouseIdleTimer = null;
  mouseMovedRecently = false;
  lastScrollWasSynthetic = false;
  scrollToTopOnMouseIdle = false;

  _getScrollingElement = () => {
    if (this.props.bindToDocument) {
      return (document.scrollingElement || document.body);
    } else {
      return this.node;
    }
  };

  setScrollTop = newScrollTop => {
    if (this.getScrollTop() !== newScrollTop) {
      this.lastScrollWasSynthetic = true;

      this._getScrollingElement().scrollTop = newScrollTop;
    }
  };

  clearMouseIdleTimer = () => {
    if (this.mouseIdleTimer === null) {
      return;
    }

    clearTimeout(this.mouseIdleTimer);
    this.mouseIdleTimer = null;
  };

  handleMouseMove = throttle(() => {
    // As long as the mouse keeps moving, clear and restart the idle timer.
    this.clearMouseIdleTimer();
    this.mouseIdleTimer = setTimeout(this.handleMouseIdle, MOUSE_IDLE_DELAY);

    if (!this.mouseMovedRecently && this.getScrollTop() === 0) {
      // Only set if we just started moving and are scrolled to the top.
      this.scrollToTopOnMouseIdle = true;
    }

    // Save setting this flag for last, so we can do the comparison above.
    this.mouseMovedRecently = true;
  }, MOUSE_IDLE_DELAY / 2);

  handleWheel = throttle(() => {
    this.scrollToTopOnMouseIdle = false;
  }, 150, {
    trailing: true,
  });

  handleMouseIdle = () => {
    if (this.scrollToTopOnMouseIdle && !this.props.preventScroll) {
      this.setScrollTop(0);
    }

    this.mouseMovedRecently = false;
    this.scrollToTopOnMouseIdle = false;
  };

  componentDidMount () {
    this.attachScrollListener();
    this.attachIntersectionObserver();

    attachFullscreenListener(this.onFullScreenChange);

    if (this.props.rememberPosition) {
      this.restoreRememberedPosition();
    }

    // Handle initial scroll position
    this.handleScroll();
  }

  _getViewportTop = () => {
    return this.props.bindToDocument ? 0 : this.node.getBoundingClientRect().top;
  };

  // 마지막으로 멈춰 있던 화면에서 목록이 놓였던 자리. 스크롤할 때마다 적는다.
  //
  // 떠나는 순간(componentWillUnmount)에는 화면이 이미 허물어지는 중이다. 목록 위의
  // 칼럼 헤더가 먼저 빠지거나 문서가 짧아지면 목록 전체가 사용자가 보던 자리에서
  // 위로 밀린다. 크롬은 스크롤 앵커링(overflow-anchor)으로 스크롤 값을 같이 줄여
  // 화면상 위치를 지켜 주지만, **사파리(WebKit)에는 그 기능이 없어** 글들이 헤더
  // 높이(모바일 97px)만큼 올라간 채로 재진다. 그 값을 그대로 기억하면 돌아올 때마다
  // 헤더 높이만큼 아래로 밀리고, 탭을 오갈수록 쌓인다.
  rememberRestingPosition = () => {
    if (!this.node) return;

    this.restingListTop = this.node.getBoundingClientRect().top;
    this.restingScrollTop = this.getScrollTop();
  };

  // 맨 위에서 보고 있었으면 기억하지 않는다. 돌아왔을 때 그사이 올라온 새 글이
  // 위에 숨지 않고 그대로 보여야 한다.
  rememberCurrentPosition () {
    if (!this.node) return;

    const scrollTop = this.restingScrollTop ?? this.getScrollTop();
    const atTop = scrollTop < TOP_THRESHOLD;

    // 목록 안의 배치는 허물어지는 동안에도 그대로이므로, 목록이 마지막으로 놓였던
    // 자리만큼 되돌려서 잰다. 칼럼 안에서 스크롤하는 경우(다중 칼럼)는 기준이
    // 목록 자신이라 밀림이 생기지 않는다.
    const shift = this.props.bindToDocument && this.restingListTop !== undefined
      ? this.restingListTop - this.node.getBoundingClientRect().top
      : 0;
    const anchor = atTop ? null : findScrollAnchor(this.node, this._getViewportTop() - shift);

    saveScrollAnchor(this.props.scrollKey, anchor);
  }

  // 화면 이동 때의 "맨 위로" 는 `mastodon.jsx` 가 이 화면에 한해 꺼 두므로,
  // 기억한 것이 없을 때도 여기서 직접 맨 위로 보낸다. 안 그러면 직전 화면의
  // 스크롤 값이 그대로 남는다.
  restoreRememberedPosition () {
    const anchor = getScrollAnchor(this.props.scrollKey);

    if (!this.node || !anchor) {
      this.setScrollTop(0);
      return;
    }

    // 첫 시도는 반드시 어딘가로 정한다. 기준 글이 없으면(지워졌거나, 목록이
    // 새로 받아지는 중이면) 맨 위로 — 라우터의 "맨 위로" 를 꺼 두었으므로 안
    // 그러면 직전 화면의 스크롤 값이 남는다. 이후 시도는 사용자가 그사이
    // 스크롤했으면(값이 우리가 둔 것과 다르면) 손대지 않는다.
    let expectedTop = null;

    const apply = () => {
      if (!this.node) return;
      if (expectedTop !== null && this.getScrollTop() !== expectedTop) return;

      const delta = scrollDeltaToAnchor(this.node, this._getViewportTop(), anchor);

      if (delta !== null) {
        this.setScrollTop(this.getScrollTop() + delta);
      } else if (expectedTop === null) {
        this.setScrollTop(0);
      }

      expectedTop = this.getScrollTop();
      // 되돌린 자리가 곧 "멈춰 있던 자리" 다. 값이 같으면 스크롤 이벤트가 안 나므로 직접 적는다.
      this.rememberRestingPosition();
    };

    apply();
    this.anchorTimers = ANCHOR_SETTLE_DELAYS.map(delay => setTimeout(apply, delay));
  }

  getScrollPosition = () => {
    if (this.node && (this.getScrollTop() > 0 || this.mouseMovedRecently)) {
      return { height: this.getScrollHeight(), top: this.getScrollTop() };
    } else {
      return null;
    }
  };

  getScrollTop = () => {
    return this._getScrollingElement().scrollTop;
  };

  getScrollHeight = () => {
    return this._getScrollingElement().scrollHeight;
  };

  getClientHeight = () => {
    return this._getScrollingElement().clientHeight;
  };

  updateScrollBottom = (snapshot) => {
    const newScrollTop = this.getScrollHeight() - snapshot;

    this.setScrollTop(newScrollTop);
  };

  getSnapshotBeforeUpdate (prevProps) {
    const someItemInserted = Children.count(prevProps.children) > 0 &&
      Children.count(prevProps.children) < Children.count(this.props.children) &&
      this.getFirstChildKey(prevProps) !== this.getFirstChildKey(this.props);
    const pendingChanged = (prevProps.numPending > 0) !== (this.props.numPending > 0);

    if (pendingChanged || someItemInserted && (this.getScrollTop() > 0 || this.mouseMovedRecently || this.props.preventScroll)) {
      return this.getScrollHeight() - this.getScrollTop();
    } else {
      return null;
    }
  }

  componentDidUpdate (prevProps, prevState, snapshot) {
    // Reset the scroll position when a new child comes in in order not to
    // jerk the scrollbar around if you're already scrolled down the page.
    if (snapshot !== null) {
      this.setScrollTop(this.getScrollHeight() - snapshot);
    }
  }

  cacheMediaWidth = (width) => {
    if (width && this.state.cachedMediaWidth !== width) {
      this.setState({ cachedMediaWidth: width });
    }
  };

  componentWillUnmount () {
    if (this.props.rememberPosition) {
      this.rememberCurrentPosition();
    }

    this.anchorTimers?.forEach(clearTimeout);
    this.clearMouseIdleTimer();
    this.detachScrollListener();
    this.detachIntersectionObserver();

    detachFullscreenListener(this.onFullScreenChange);
  }

  onFullScreenChange = () => {
    this.setState({ fullscreen: isFullscreen() });
  };

  attachIntersectionObserver () {
    let nodeOptions = {
      root: this.node,
      rootMargin: '300% 0px',
    };

    this.intersectionObserverWrapper
      .connect(this.props.bindToDocument ? {} : nodeOptions);
  }

  detachIntersectionObserver () {
    this.intersectionObserverWrapper.disconnect();
  }

  attachScrollListener () {
    const target = this.props.bindToDocument ? document : this.node;

    target.addEventListener('scroll', this.handleScroll);
    target.addEventListener('wheel', this.handleWheel, listenerOptions);

    // 쓰로틀하지 않는다. 마지막 스크롤 직후에 바로 떠나도 그 자리를 적어 두어야 한다.
    if (this.props.rememberPosition) {
      target.addEventListener('scroll', this.rememberRestingPosition, listenerOptions);
    }
  }

  detachScrollListener () {
    const target = this.props.bindToDocument ? document : this.node;

    target.removeEventListener('scroll', this.handleScroll);
    target.removeEventListener('wheel', this.handleWheel, listenerOptions);
    target.removeEventListener('scroll', this.rememberRestingPosition, listenerOptions);
  }

  getFirstChildKey (props) {
    const { children } = props;
    let firstChild     = children;

    if (children instanceof ImmutableList) {
      firstChild = children.get(0);
    } else if (Array.isArray(children)) {
      firstChild = children[0];
    }

    return firstChild && firstChild.key;
  }

  setRef = (c) => {
    this.node = c;
  };

  handleLoadMore = e => {
    e.preventDefault();
    this.props.onLoadMore();
  };

  handleLoadPending = e => {
    e.preventDefault();
    this.props.onLoadPending();
    // Prevent the weird scroll-jumping behavior, as we explicitly don't want to
    // scroll to top, and we know the scroll height is going to change
    this.scrollToTopOnMouseIdle = false;
    this.lastScrollWasSynthetic = false;
    this.clearMouseIdleTimer();
    this.mouseIdleTimer = setTimeout(this.handleMouseIdle, MOUSE_IDLE_DELAY);
    this.mouseMovedRecently = true;
  };

  render () {
    const { children, scrollKey, className, trackScroll, showLoading, isLoading, hasMore, numPending, prepend, alwaysPrepend, append, footer, emptyMessage, onLoadMore } = this.props;
    const { fullscreen } = this.state;
    const childrenCount = Children.count(children);

    const loadMore     = (hasMore && onLoadMore) ? <LoadMore visible={!isLoading} onClick={this.handleLoadMore} /> : null;
    const loadPending  = (numPending > 0) ? <LoadPending count={numPending} onClick={this.handleLoadPending} /> : null;
    let scrollableArea = null;

    if (showLoading) {
      scrollableArea = (
        <div className='scrollable scrollable--flex' ref={this.setRef}>
          {prepend}

          <div role='feed' className='item-list' />

          <div className='scrollable__append'>
            <LoadingIndicator />
          </div>

          {footer}
        </div>
      );
    } else if (isLoading || childrenCount > 0 || numPending > 0 || hasMore || !emptyMessage) {
      scrollableArea = (
        <div className={classNames('scrollable scrollable--flex', { fullscreen })} ref={this.setRef} onMouseMove={this.handleMouseMove}>
          {prepend}

          <div role='feed' className={classNames('item-list', className)}>
            {loadPending}

            {Children.map(this.props.children, (child, index) => (
              <IOArticleContainerWrapper
                key={child.key}
                id={child.key}
                index={index}
                listLength={childrenCount}
                intersectionObserverWrapper={this.intersectionObserverWrapper}
                trackScroll={trackScroll}
                scrollKey={scrollKey}
              >
                {cloneElement(child, {
                  getScrollPosition: this.getScrollPosition,
                  updateScrollBottom: this.updateScrollBottom,
                  cachedMediaWidth: this.state.cachedMediaWidth,
                  cacheMediaWidth: this.cacheMediaWidth,
                })}
              </IOArticleContainerWrapper>
            ))}

            {loadMore}

            {!hasMore && append}
          </div>

          {footer}
        </div>
      );
    } else {
      scrollableArea = (
        <div className={classNames('scrollable scrollable--flex', { fullscreen })} ref={this.setRef}>
          {alwaysPrepend && prepend}

          <div className='empty-column-indicator'>
            {emptyMessage}
          </div>

          {footer}
        </div>
      );
    }

    if (trackScroll) {
      return (
        <ScrollContainer scrollKey={scrollKey}>
          {scrollableArea}
        </ScrollContainer>
      );
    } else {
      return scrollableArea;
    }
  }

}

export default connect(mapStateToProps, null, null, { forwardRef: true })(ScrollableList);
