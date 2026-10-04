import { useCallback, useRef } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { matchPath, useLocation } from 'react-router';
import { Link, NavLink } from 'react-router-dom';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
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
          <NavItem
            to='/home'
            exact
            activePaths={TIMELINE_TAB_PATHS}
            icon={<Icon id='' icon={HomeIcon} />}
            activeIcon={<Icon id='' icon={HomeActiveIcon} />}
            label={intl.formatMessage(messages.home)}
          />

          <NavItem
            to='/pending-mentions'
            icon={<Icon id='' icon={PendingMentionsIcon} />}
            activeIcon={<Icon id='' icon={PendingMentionsActiveIcon} />}
            label={intl.formatMessage(messages.pendingMentions)}
          />

          <NotificationsNavItem />

          <NavItem
            to='/messages'
            exact={false}
            icon={<Icon id='' icon={MessagesIcon} />}
            activeIcon={<Icon id='' icon={MessagesActiveIcon} />}
            label={intl.formatMessage(messages.messages)}
          />

        </div>
      </div>
    </>
  );
};
