import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { matchPath, useLocation } from 'react-router';
import { Link, NavLink } from 'react-router-dom';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
import MenuIcon from '@/material-icons/400-24px/menu.svg?react';
import BellActiveIcon from '@/styles/bird-theme-svg/bell-fill.svg?react';
import BellIcon from '@/styles/bird-theme-svg/bell.svg?react';
import MessagesActiveIcon from '@/styles/bird-theme-svg/envelope-fill.svg?react';
import MessagesIcon from '@/styles/bird-theme-svg/envelope.svg?react';
import HomeActiveIcon from '@/styles/bird-theme-svg/home-fill.svg?react';
import HomeIcon from '@/styles/bird-theme-svg/home.svg?react';
import PublicFillIcon from '@/styles/bird-theme-svg/planet-fill.svg?react';
import PublicIcon from '@/styles/bird-theme-svg/planet.svg?react';
import { toggleNavigation } from 'mastodon/actions/navigation';
import { Icon } from 'mastodon/components/icon';
import { IconWithBadge } from 'mastodon/components/icon_with_badge';
import { useIdentity } from 'mastodon/identity_context';
import { selectUnreadNotificationGroupsCount } from 'mastodon/selectors/notifications';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  home: { id: 'tabs_bar.home', defaultMessage: 'Home' },
  realtime: { id: 'tabs_bar.realtime', defaultMessage: 'Live feed' },
  publish: { id: 'tabs_bar.publish', defaultMessage: 'New Post' },
  notifications: {
    id: 'tabs_bar.notifications',
    defaultMessage: 'Notifications',
  },
  messages: { id: 'navigation_bar.messages', defaultMessage: 'Messages' },
  menu: { id: 'tabs_bar.menu', defaultMessage: 'Menu' },
});

const NavItem = ({
  to,
  icon,
  activeIcon,
  label,
  exact = true,
}: {
  to: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  label: string;
  exact?: boolean;
}) => {
  const location = useLocation();
  const isActive = Boolean(
    matchPath(location.pathname, {
      path: to,
      exact,
      strict: false,
    }),
  );

  return (
    <NavLink
      to={to}
      exact={exact}
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
  const dispatch = useAppDispatch();
  const { signedIn } = useIdentity();
  const navigationOpen = useAppSelector((state) => state.navigation.open);

  const handleMenuClick = useCallback(() => {
    dispatch(toggleNavigation());
  }, [dispatch]);

  if (!signedIn) {
    return null;
  }

  return (
    <>
      <ComposeFab />

      <div className='ui__navigation-bar'>
        <div className='ui__navigation-bar__items ui__navigation-bar__items--signed-in'>
          <NavItem
            to='/home'
            exact
            icon={<Icon id='' icon={HomeIcon} />}
            activeIcon={<Icon id='' icon={HomeActiveIcon} />}
            label={intl.formatMessage(messages.home)}
          />

          <NavItem
            to='/public'
            exact={false}
            icon={<Icon id='' icon={PublicIcon} />}
            activeIcon={<Icon id='' icon={PublicFillIcon} />}
            label={intl.formatMessage(messages.realtime)}
          />

          <NotificationsNavItem />

          <NavItem
            to='/messages'
            exact={false}
            icon={<Icon id='' icon={MessagesIcon} />}
            activeIcon={<Icon id='' icon={MessagesActiveIcon} />}
            label={intl.formatMessage(messages.messages)}
          />

          <button
            type='button'
            className={classNames(
              'ui__navigation-bar__item',
              'ui__navigation-bar__item--menu',
              { active: navigationOpen },
            )}
            aria-label={intl.formatMessage(messages.menu)}
            onClick={handleMenuClick}
          >
            <Icon id='' icon={MenuIcon} />
          </button>
        </div>
      </div>
    </>
  );
};
