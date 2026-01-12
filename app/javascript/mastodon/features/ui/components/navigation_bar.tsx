import { useCallback } from 'react';

import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { matchPath, useLocation } from 'react-router';

import AddIcon from '@/material-icons/400-24px/add.svg?react';
import AddFillIcon from '@/material-icons/400-24px/add-fill.svg?react';
import HomeActiveIcon from '@/material-icons/400-24px/home-fill.svg?react';
import HomeIcon from '@/material-icons/400-24px/home.svg?react';
import MenuIcon from '@/material-icons/400-24px/menu.svg?react';
import NotificationsActiveIcon from '@/material-icons/400-24px/notifications-fill.svg?react';
import NotificationsIcon from '@/material-icons/400-24px/notifications.svg?react';
import PublicIcon from '@/material-icons/400-24px/public.svg?react';
import PublicFillIcon from '@/material-icons/400-24px/public-fill.svg?react';
import { toggleNavigation } from 'mastodon/actions/navigation';
import { Icon } from 'mastodon/components/icon';
import { IconWithBadge } from 'mastodon/components/icon_with_badge';
import { useIdentity } from 'mastodon/identity_context';
import { selectUnreadNotificationGroupsCount } from 'mastodon/selectors/notifications';
import { useAppDispatch, useAppSelector } from 'mastodon/store';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  home: { id: 'tabs_bar.home', defaultMessage: 'Home' },
  realtime: { id: 'tabs_bar.realtime', defaultMessage: 'Live feed' },
  publish: { id: 'tabs_bar.publish', defaultMessage: 'New Post' },
  notifications: { id: 'tabs_bar.notifications', defaultMessage: 'Notifications' },
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
    <NavLink to={to} exact={exact} className='ui__navigation-bar__item' activeClassName='active' aria-label={label}>
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
      icon={<IconWithBadge id='bell' icon={NotificationsIcon} count={count} className='' />}
      activeIcon={<IconWithBadge id='bell' icon={NotificationsActiveIcon} count={count} className='' />}
    />
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

        <NavItem
          to='/publish'
          icon={<Icon id='' icon={AddIcon} />}
          activeIcon={<Icon id='' icon={AddFillIcon} />}
          label={intl.formatMessage(messages.publish)}
        />

        <NotificationsNavItem />

        <button
          type='button'
          className={classNames('ui__navigation-bar__item', 'ui__navigation-bar__item--menu', { active: navigationOpen })}
          aria-label={intl.formatMessage(messages.menu)}
          onClick={handleMenuClick}
        >
          <Icon id='' icon={MenuIcon} />
        </button>
      </div>
    </div>
  );
};

