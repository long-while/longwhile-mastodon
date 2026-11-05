import { useCallback, useRef } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Link, useLocation } from 'react-router-dom';

import { useHideOnScroll } from 'mastodon/hooks/useHideOnScroll';

const messages = defineMessages({
  label: { id: 'timeline_tabs.label', defaultMessage: 'Timelines' },
  home: { id: 'column.home', defaultMessage: 'Home' },
  // 칼럼 제목(`column.firehose`, "퍼블릭 툿")과 따로 둔다. 탭은 짧게.
  public: { id: 'timeline_tabs.public', defaultMessage: 'Public' },
});

// `/timelines/home` 은 홈의 옛 주소다. 같은 화면이므로 그때도 홈 탭을 켠다.
const TABS = [
  { to: '/home', paths: ['/home', '/timelines/home'], message: messages.home },
  { to: '/public', paths: ['/public'], message: messages.public },
] as const;

// 이 탭들 중 어디에 있든 "홈" 으로 친다 — 하단 막대와 사이드바의 홈 항목이
// 퍼블릭 탭에서도 켜져 있어야 한다.
export const TIMELINE_TAB_PATHS: string[] = TABS.flatMap(({ paths }) => paths);

interface Props {
  // 이미 보고 있는 탭을 다시 눌렀을 때. 보통 맨 위로 올린다.
  onActiveClick?: () => void;
}

// @_longwhile — 홈·퍼블릭 타임라인 위의 탭 줄(X 의 "추천 | 팔로잉").
//
//   주소는 `/home`·`/public` 을 그대로 쓴다 — 새로고침이나 주소 직접 입력이
//   그대로 동작한다. 대신 **`replace` 로 옮긴다.** 탭을 바꿀 때마다 기록이
//   쌓이면 뒤로가기가 탭 사이를 왕복한다(X 도 쌓지 않는다).
//
//   돌아왔을 때 읽던 글부터 보이는 것은 이 컴포넌트가 아니라 각 화면의
//   `ScrollableList rememberPosition` 이 한다(utils/scroll_anchor.ts).
export const TimelineTabs: React.FC<Props> = ({ onActiveClick }) => {
  const intl = useIntl();
  const { pathname } = useLocation();
  const ref = useRef<HTMLSpanElement>(null);

  // 아래로 스크롤하면 헤더(로고 줄 + 이 탭 줄)가 위로 숨는다. 칼럼 헤더가 아니라
  // 여기서 거는 것은, 헤더가 위쪽 상자로 포털되며 다시 마운트돼도 이 효과가
  // 따라서 다시 돌게 하려는 것이다.
  useHideOnScroll(ref, true);

  const handleActiveClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onActiveClick?.();
    },
    [onActiveClick],
  );

  // `<nav>` 가 아니라 `role` 을 준 span 이다. 칼럼 헤더의 h1 안에 들어가는데,
  // h1 에는 구문 콘텐츠만 올 수 있다(`<nav>` 는 안 된다).
  return (
    <span
      ref={ref}
      role='navigation'
      className='column-header__tabs'
      aria-label={intl.formatMessage(messages.label)}
    >
      {TABS.map(({ to, paths, message }) => {
        const active = (paths as readonly string[]).includes(pathname);

        return (
          <Link
            key={to}
            to={to}
            replace
            className={classNames('column-header__tab', { active })}
            aria-current={active ? 'page' : undefined}
            onClick={active ? handleActiveClick : undefined}
          >
            <span>{intl.formatMessage(message)}</span>
          </Link>
        );
      })}
    </span>
  );
};
