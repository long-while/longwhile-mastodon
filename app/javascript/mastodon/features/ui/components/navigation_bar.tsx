import { useCallback, useRef } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { matchPath, useLocation } from 'react-router';
import { Link, NavLink } from 'react-router-dom';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
// @_longwhile — 하단 바 아이콘을 bird-theme-svg 것으로 바꿨다(2026-08-13).
//
//   **`Icon` 의 `id` 를 비워 둔 채로 둔다.** 그것이 `icon-홈` 같은 클래스가 되고,
//   테마 SCSS 는 그 클래스에 `mask-image`/`background-image` 로 자기 그림을 덧
//   깐다. 이름을 주는 순간 원본 path 위에 테마 그림이 겹쳐 그려진다 — 예전에
//   실제로 밟은 함정이다. 알림만 `bell` 을 유지하는데, 테마가 하단 바에 한해
//   그 마스크를 꺼 두는 규칙을 이미 갖고 있기 때문이다
//   (`.ui__navigation-bar .icon-bell { mask-image: none !important }`).
//
//   여덟 파일 모두 viewBox 가 있고 `fill` 속성이 없어, 테마의
//   `.ui__navigation-bar__item svg { fill: currentColor }` 를 그대로 받는다.
import BellActiveIcon from '@/styles/bird-theme-svg/bell-fill.svg?react';
import BellIcon from '@/styles/bird-theme-svg/bell.svg?react';
import MessagesActiveIcon from '@/styles/bird-theme-svg/envelope-fill.svg?react';
import MessagesIcon from '@/styles/bird-theme-svg/envelope.svg?react';
import HomeActiveIcon from '@/styles/bird-theme-svg/home-fill.svg?react';
import HomeIcon from '@/styles/bird-theme-svg/home.svg?react';
import PendingMentionsActiveIcon from '@/styles/bird-theme-svg/messages-fill.svg?react';
import PendingMentionsIcon from '@/styles/bird-theme-svg/messages.svg?react';
import { Icon } from 'mastodon/components/icon';
import { IconWithBadge } from 'mastodon/components/icon_with_badge';
import { useDimOnScroll } from 'mastodon/hooks/useHideOnScroll';
import { useIdentity } from 'mastodon/identity_context';
import { selectUnreadNotificationGroupsCount } from 'mastodon/selectors/notifications';
import { useAppSelector } from 'mastodon/store';

import { TIMELINE_TAB_PATHS } from './timeline_tabs';

const messages = defineMessages({
  home: { id: 'tabs_bar.home', defaultMessage: 'Home' },
  publish: { id: 'tabs_bar.publish', defaultMessage: 'New Post' },
  notifications: {
    id: 'tabs_bar.notifications',
    defaultMessage: 'Notifications',
  },
  messages: { id: 'navigation_bar.messages', defaultMessage: 'Messages' },
  pendingMentions: {
    id: 'navigation_bar.pending-mentions',
    defaultMessage: 'Awaiting reply',
  },
});

const NavItem = ({
  to,
  icon,
  activeIcon,
  label,
  exact = true,
  activePaths,
}: {
  to: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  label: string;
  exact?: boolean;
  // `to` 말고도 이 칸을 켜 둘 주소들. 주면 `to` 대신 이것으로 판단한다.
  activePaths?: string[];
}) => {
  const location = useLocation();
  const isActive = Boolean(
    matchPath(location.pathname, {
      path: activePaths ?? to,
      exact,
      strict: false,
    }),
  );
  const matchesActive = useCallback(() => isActive, [isActive]);

  return (
    <NavLink
      to={to}
      exact={exact}
      isActive={matchesActive}
      className='ui__navigation-bar__item'
      activeClassName='active'
      aria-label={label}
    >
      {isActive && activeIcon ? activeIcon : icon}
    </NavLink>
  );
};

const NotificationsNavItem = () => {
  const count = useAppSelector(selectUnreadNotificationGroupsCount);
  const intl = useIntl();

  return (
    <NavItem
      to='/notifications'
      label={intl.formatMessage(messages.notifications)}
      icon={
        <IconWithBadge
          id='bell'
          icon={BellIcon}
          count={count}
          issueBadge={false}
          className=''
        />
      }
      activeIcon={
        <IconWithBadge
          id='bell'
          icon={BellActiveIcon}
          count={count}
          issueBadge={false}
          className=''
        />
      }
    />
  );
};

// @_longwhile — 모바일 전용 글쓰기 단추 (2026-08-13).
//
//   하단 바에 있던 "새 게시물" 을 여기로 옮겼다. 다섯 칸 중 하나를 글쓰기가
//   차지하고 있었는데, 그 자리에 채팅이 들어가야 했다.
//
//   **타임라인에서만 띄운다.** 알림·채팅·설정 화면에서 글쓰기 단추가 떠 있으면
//   그 화면의 내용을 가리기만 한다. 특히 채팅에서는 입력창 바로 위에 겹친다.
//
//   `/public` 은 하위 경로(`/public/local` 등)까지 받는다. 하단 바의 퍼블릭
//   항목이 `exact={false}` 인 것과 같은 이유다.
const COMPOSE_FAB_PATHS = ['/home', '/public'];

const ComposeFab: React.FC = () => {
  const intl = useIntl();
  const location = useLocation();

  const visible = COMPOSE_FAB_PATHS.some((path) =>
    Boolean(matchPath(location.pathname, { path, exact: path === '/home' })),
  );

  if (!visible) return null;

  return (
    <Link
      to='/publish'
      className='ui__compose-fab'
      aria-label={intl.formatMessage(messages.publish)}
      title={intl.formatMessage(messages.publish)}
    >
      <Icon id='' icon={AddIcon} />
    </Link>
  );
};

export const NavigationBar: React.FC = () => {
  const intl = useIntl();
  const { signedIn } = useIdentity();
  const barRef = useRef<HTMLDivElement>(null);

  useDimOnScroll(barRef);

  if (!signedIn) {
    return null;
  }

  return (
    <>
      <ComposeFab />

      <div className='ui__navigation-bar' ref={barRef}>
        <div className='ui__navigation-bar__items ui__navigation-bar__items--signed-in'>
          {/* 퍼블릭 칸은 없앴다. 퍼블릭은 홈 위의 탭(TimelineTabs)으로 가므로,
            그 탭에 있을 때도 홈 칸을 켜 둔다(X 와 같다). */}
          <NavItem
            to='/home'
            exact
            activePaths={TIMELINE_TAB_PATHS}
            icon={<Icon id='' icon={HomeIcon} />}
            activeIcon={<Icon id='' icon={HomeActiveIcon} />}
            label={intl.formatMessage(messages.home)}
          />

          {/* 홈 / 답장할 멘션 / 알림 / 채팅. 이 넷은 모바일 서랍에서는 빠진다
            (navigation_panel.jsx 의 `inBottomBar`). */}
          <NavItem
            to='/pending-mentions'
            icon={<Icon id='' icon={PendingMentionsIcon} />}
            activeIcon={<Icon id='' icon={PendingMentionsActiveIcon} />}
            label={intl.formatMessage(messages.pendingMentions)}
          />

          <NotificationsNavItem />

          {/* "새 게시물" 이 있던 자리다. 글쓰기는 오른쪽 아래 떠 있는 단추로
            옮겼고(아래 ComposeFab), 그 자리에 채팅을 넣었다.

            `exact={false}` 라야 `/messages/3` 에서도 켜져 있다. 운영진 화면
            (`/messages/all`)까지 같이 켜지는데, 하단 바에는 그 항목이 없으므로
            여기서는 나눌 이유가 없다. */}
          <NavItem
            to='/messages'
            exact={false}
            icon={<Icon id='' icon={MessagesIcon} />}
            activeIcon={<Icon id='' icon={MessagesActiveIcon} />}
            label={intl.formatMessage(messages.messages)}
          />

          {/* ☰ 메뉴 칸은 없앴다. 서랍은 헤더 왼쪽 위의 프로필 사진
            (MobileMenuAvatarButton)이 연다 — X 와 같은 자리다. */}
        </div>
      </div>
    </>
  );
};
