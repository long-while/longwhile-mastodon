import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Component, useEffect } from 'react';

import { defineMessages, injectIntl, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import { useSelector, useDispatch } from 'react-redux';

import AccountCircleIcon from '@/material-icons/400-24px/account_circle.svg?react';
import AddIcon from '@/material-icons/400-24px/add.svg?react';
import AlternateEmailIcon from '@/material-icons/400-24px/mail.svg?react';
import BookmarksActiveIcon from '@/material-icons/400-24px/bookmarks-fill.svg?react';
import BookmarksIcon from '@/material-icons/400-24px/bookmarks.svg?react';
import ExploreActiveIcon from '@/material-icons/400-24px/explore-fill.svg?react';
import ExploreIcon from '@/material-icons/400-24px/explore.svg?react';
import ModerationIcon from '@/material-icons/400-24px/gavel.svg?react';
import HomeActiveIcon from '@/material-icons/400-24px/home-fill.svg?react';
import HomeIcon from '@/material-icons/400-24px/home.svg?react';
import ListAltActiveIcon from '@/material-icons/400-24px/list_alt-fill.svg?react';
import ListAltIcon from '@/material-icons/400-24px/list_alt.svg?react';
import AdministrationIcon from '@/material-icons/400-24px/manufacturing.svg?react';
import NotificationsActiveIcon from '@/material-icons/400-24px/notifications-fill.svg?react';
import NotificationsIcon from '@/material-icons/400-24px/notifications.svg?react';
import PublicIcon from '@/material-icons/400-24px/public.svg?react';
import SearchIcon from '@/material-icons/400-24px/search.svg?react';
import SettingsIcon from '@/material-icons/400-24px/settings.svg?react';
import StarActiveIcon from '@/material-icons/400-24px/star-fill.svg?react';
import StarIcon from '@/material-icons/400-24px/star.svg?react';
import { Icon } from 'mastodon/components/icon';
import { IconWithBadge } from 'mastodon/components/icon_with_badge';
import { WordmarkLogo } from 'mastodon/components/logo';
import { NavigationPortal } from 'mastodon/components/navigation_portal';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { timelinePreview, trendsEnabled } from 'mastodon/initial_state';
import { canManageReports, canViewAdminDashboard } from 'mastodon/permissions';
import { selectUnreadNotificationGroupsCount } from 'mastodon/selectors/notifications';

import { AccountSwitcher } from './account_switcher';
import ColumnLink from './column_link';
import DisabledAccountBanner from './disabled_account_banner';
import SignInBanner from './sign_in_banner';
import { Search } from 'mastodon/features/compose/components/search';
import { useBreakpoint } from 'mastodon/hooks/useBreakpoint';
import { closeNavigation } from 'mastodon/actions/navigation';
import { connect } from 'react-redux';
import { Avatar } from 'mastodon/components/avatar';
import { me } from 'mastodon/initial_state';

const messages = defineMessages({
  home: { id: 'tabs_bar.home', defaultMessage: 'Home' },
  notifications: { id: 'tabs_bar.notifications', defaultMessage: 'Notifications' },
  explore: { id: 'explore.title', defaultMessage: 'Explore' },
  firehose: { id: 'column.firehose', defaultMessage: 'Live feeds' },
  direct: { id: 'navigation_bar.direct', defaultMessage: 'Private mentions' },
  favourites: { id: 'navigation_bar.favourites', defaultMessage: 'Favorites' },
  bookmarks: { id: 'navigation_bar.bookmarks', defaultMessage: 'Bookmarks' },
  lists: { id: 'navigation_bar.lists', defaultMessage: 'Lists' },
  preferences: { id: 'navigation_bar.preferences', defaultMessage: 'Preferences' },
  administration: { id: 'navigation_bar.administration', defaultMessage: 'Administration' },
  moderation: { id: 'navigation_bar.moderation', defaultMessage: 'Moderation' },
  followsAndFollowers: { id: 'navigation_bar.follows_and_followers', defaultMessage: 'Follows and followers' },
  search: { id: 'navigation_bar.search', defaultMessage: 'Search' },
  followRequests: { id: 'navigation_bar.follow_requests', defaultMessage: 'Follow requests' },
  compose: { id: 'navigation_panel.compose', defaultMessage: 'New Post' },
  accountSwitch: { id: 'navigation_panel.account_switch', defaultMessage: 'Switch accounts' },
});

const ProfileSummary = connect((state) => {
  const accounts = typeof state?.getIn === 'function' ? state.getIn(['accounts']) : state?.accounts ?? null;
  const account = (() => {
    if (!accounts || !me) return null;
    if (typeof accounts.get === 'function') return accounts.get(me);
    return accounts[me] ?? null;
  })();
  return { account };
})(({ account, avatarSize = 48 }) => {
  if (!account) {
    return null;
  }

  const getValue = (key) => (typeof account.get === 'function' ? account.get(key) : account[key]);

  const acct = getValue('acct');
  const displayName = getValue('display_name_html') || getValue('display_name') || getValue('username');

  return (
    <Link to={`/@${acct}`} className='navigation-panel__profile-card' title={acct}>
      <div className='navigation-panel__profile-avatar'>
        <Avatar account={account} size={avatarSize} />
      </div>
      <div className='navigation-panel__profile-meta'>
        <strong
          className='navigation-panel__profile-name'
          dangerouslySetInnerHTML={{ __html: displayName }}
        />
        <span className='navigation-panel__profile-handle'>@{acct}</span>
      </div>
    </Link>
  );
});

const ProfileSection = ({ avatarSize }) => (
  <div className='navigation-panel__profile'>
    <ProfileSummary avatarSize={avatarSize} />
  </div>
);
ProfileSection.propTypes = {
  avatarSize: PropTypes.number,
};

const AccountSwitcherMenuItem = () => {
  const intl = useIntl();
  const label = intl.formatMessage(messages.accountSwitch);

  return (
    <AccountSwitcher
      renderTrigger={({ openManage }) => (
        <button
          type='button'
          className='column-link column-link--transparent navigation-panel__account-switch-link'
          onClick={openManage}
        >
          <Icon id='account-circle' icon={AccountCircleIcon} className='column-link__icon' />
          <span>{label}</span>
        </button>
      )}
    />
  );
};

const NotificationsLink = () => {

  const count = useSelector(selectUnreadNotificationGroupsCount);
  const intl = useIntl();
  const label = intl.formatMessage(messages.notifications);

  return (
    <ColumnLink
      key='notifications'
      transparent
      to='/notifications'
      icon={<IconWithBadge id='bell' icon={NotificationsIcon} count={count} className='column-link__icon' />}
      activeIcon={<IconWithBadge id='bell' icon={NotificationsActiveIcon} count={count} className='column-link__icon' />}
      text={label}
    />
  );
};

class NavigationPanel extends Component {
  static propTypes = {
    identity: identityContextPropShape,
    intl: PropTypes.object.isRequired,
    renderSearch: PropTypes.bool,
    renderComposeButton: PropTypes.bool,
    isBelowFullBreakpoint: PropTypes.bool,
    isMobileBreakpoint: PropTypes.bool,
  };

  static defaultProps = {
    renderSearch: false,
    renderComposeButton: false,
    isBelowFullBreakpoint: false,
    isMobileBreakpoint: false,
  };

  isFirehoseActive = (match, location) => {
    return match || location.pathname.startsWith('/public');
  };

  render () {
    const { intl, isBelowFullBreakpoint, isMobileBreakpoint } = this.props;
    const { signedIn, disabledAccountId, permissions } = this.props.identity;

    const renderSearch = this.props.renderSearch ?? false;
    const renderComposeButton = this.props.renderComposeButton ?? false;
    const isFullView = !isBelowFullBreakpoint;
    const showIdentitySection = signedIn && !isFullView;
    const profileAvatarSize = isFullView ? 48 : 36;

    const panelClassName = classNames('navigation-panel', {
      'navigation-panel--full': isFullView,
      'navigation-panel--compact': !isFullView,
      'navigation-panel--mobile': isMobileBreakpoint,
    });

    return (
      <div className={panelClassName}>
        <div className='navigation-panel__logo'>
          <Link to='/' className='column-link column-link--logo'><WordmarkLogo /></Link>
        </div>

        {renderSearch && (
          <div className='navigation-panel__search'>
            <Search openInRoute singleColumn />
          </div>
        )}

        {showIdentitySection && <ProfileSection avatarSize={profileAvatarSize} />}

        {renderComposeButton && signedIn && (
          <Link to='/publish' className='button button--block navigation-panel__compose-button'>
            <Icon
              id='add'
              icon={AddIcon}
              className='navigation-panel__compose-button-icon'
              aria-hidden
            />
            <span>{intl.formatMessage(messages.compose)}</span>
          </Link>
        )}

        <div className='navigation-panel__menu'>
          {signedIn && (
            <>
              {this.renderSignedInLinks(intl, true)}
            </>
          )}

          {!signedIn && trendsEnabled ? (
            <ColumnLink transparent to='/explore' icon='explore' iconComponent={ExploreIcon} activeIconComponent={ExploreActiveIcon} text={intl.formatMessage(messages.explore)} />
          ) : null}

          {!signedIn && !trendsEnabled ? (
            <ColumnLink transparent to='/search' icon='search' iconComponent={SearchIcon} text={intl.formatMessage(messages.search)} />
          ) : null}

          {!signedIn && (
            <ColumnLink transparent to='/public' isActive={this.isFirehoseActive} icon='globe' iconComponent={PublicIcon} text={intl.formatMessage(messages.firehose)} />
          )}

          {!signedIn && (
            <div className='navigation-panel__sign-in-banner'>
              <hr />
              { disabledAccountId ? <DisabledAccountBanner /> : <SignInBanner /> }
            </div>
          )}

        </div>

        <NavigationPortal />
      </div>
    );
  }
  renderSignedInLinks = (intl, includeAccountSwitcher = true) => {

    const homeLabel = intl.formatMessage(messages.home);
    const publicLabel = intl.formatMessage(messages.firehose);
    const directLabel = intl.formatMessage(messages.direct);
    const bookmarksLabel = intl.formatMessage(messages.bookmarks);
    const favouritesLabel = intl.formatMessage(messages.favourites);
    const preferencesLabel = intl.formatMessage(messages.preferences);
    const listsLabel = intl.formatMessage(messages.lists);

    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
    const settingsHref = `${origin}/settings/profile`;

    return (
      <>
        <ColumnLink transparent to='/home' icon='home' iconComponent={HomeIcon} activeIconComponent={HomeActiveIcon} text={homeLabel} />
        <ColumnLink transparent to='/public' isActive={this.isFirehoseActive} icon='globe' iconComponent={PublicIcon} text={publicLabel} />
        <NotificationsLink />
        <ColumnLink transparent to='/conversations' icon='at' iconComponent={AlternateEmailIcon} text={directLabel} />
        <ColumnLink transparent to='/bookmarks' icon='bookmarks' iconComponent={BookmarksIcon} activeIconComponent={BookmarksActiveIcon} text={bookmarksLabel} />
        <ColumnLink transparent to='/favourites' icon='star' iconComponent={StarIcon} activeIconComponent={StarActiveIcon} text={favouritesLabel} />
        <ColumnLink transparent to='/lists' icon='list-ul' iconComponent={ListAltIcon} activeIconComponent={ListAltActiveIcon} text={listsLabel} />
        <ColumnLink transparent href={settingsHref} icon='cog' iconComponent={SettingsIcon} text={preferencesLabel} />
        {includeAccountSwitcher && <AccountSwitcherMenuItem />}
      </>
    );
  };
}

const NavigationPanelWithIdentity = injectIntl(withIdentity(NavigationPanel));

const NavigationPanelWithBreakpoints = (props) => {
  const isBelowFullBreakpoint = useBreakpoint('full');
  const isMobileBreakpoint = useBreakpoint('openable');
  return (
    <NavigationPanelWithIdentity
      {...props}
      isBelowFullBreakpoint={isBelowFullBreakpoint}
      isMobileBreakpoint={isMobileBreakpoint}
    />
  );
};

export default NavigationPanelWithBreakpoints;

export const CollapsibleNavigationPanel = () => {
  const dispatch = useDispatch();
  const navigationOpen = useSelector(state => state.getIn(['navigation', 'open'], false));
  const isMobile = useBreakpoint('openable');
  const showSearch = true;
  const shouldShowOverlay = isMobile && navigationOpen;

  useEffect(() => {
    if (!navigationOpen) {
      return undefined;
    }

    const handleKeyUp = (event) => {
      if (event.key === 'Escape') {
        dispatch(closeNavigation());
      }
    };

    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [navigationOpen, dispatch]);

  useEffect(() => {
    if (!isMobile && navigationOpen) {
      dispatch(closeNavigation());
    }
  }, [isMobile, navigationOpen, dispatch]);

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      dispatch(closeNavigation());
    }
  };

  const containerClassName = classNames('navigation-panel__container', {
    'navigation-panel__container--overlay': shouldShowOverlay,
  });

  const wrapperClassName = classNames('navigation-panel__wrapper', {
    'navigation-panel__wrapper--open': !isMobile || navigationOpen,
  });

  return (
    <div
      className={containerClassName}
      onClick={shouldShowOverlay ? handleOverlayClick : undefined}
    >
      <div className={wrapperClassName}>
        <NavigationPanelWithBreakpoints
          renderSearch={showSearch}
          renderComposeButton
        />
      </div>
    </div>
  );
};
