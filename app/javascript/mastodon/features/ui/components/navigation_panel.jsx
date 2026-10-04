import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Component, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { defineMessages, injectIntl, useIntl } from 'react-intl';

import { useLocation } from 'react-router';
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
import ScheduledStatusesIcon from '@/styles/bird-theme-svg/calendar-clock.svg?react';
import FollowRequestsActiveIcon from '@/styles/bird-theme-svg/user-add-fill.svg?react';
import FollowRequestsIcon from '@/styles/bird-theme-svg/user-add.svg?react';
import PendingMentionsActiveIcon from '@/styles/bird-theme-svg/messages-fill.svg?react';
import MailIcon from '@/material-icons/400-24px/mail.svg?react';
import PendingMentionsIcon from '@/styles/bird-theme-svg/messages.svg?react';
import ProfileActiveIcon from '@/styles/bird-theme-svg/user-fill.svg?react';
import ProfileIcon from '@/styles/bird-theme-svg/user.svg?react';
import SearchIcon from '@/material-icons/400-24px/search.svg?react';
import SettingsIcon from '@/material-icons/400-24px/settings.svg?react';
import { fetchFollowRequests } from 'mastodon/actions/accounts';
import { fetchDmRooms } from 'mastodon/actions/dm_rooms';
import { Icon } from 'mastodon/components/icon';
import { IconWithBadge } from 'mastodon/components/icon_with_badge';
import { WordmarkLogo } from 'mastodon/components/logo';
import { NavigationPortal } from 'mastodon/components/navigation_portal';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { timelinePreview, trendsEnabled, dmChatEnabled } from 'mastodon/initial_state';
import { canManageDirectMessages } from 'mastodon/permissions';
import { selectUnreadDmCount } from 'mastodon/features/messages/selectors';
import { selectUnreadNotificationGroupsCount } from 'mastodon/selectors/notifications';

import { AccountSwitcher } from './account_switcher';
import ColumnLink from './column_link';
import { TIMELINE_TAB_PATHS } from './timeline_tabs';
import { Search } from 'mastodon/features/compose/components/search';
import { useBreakpoint } from 'mastodon/hooks/useBreakpoint';
import { closeNavigation } from 'mastodon/actions/navigation';
import { connect } from 'react-redux';
import { Avatar } from 'mastodon/components/avatar';
import { FollowersCounter, FollowingCounter } from 'mastodon/components/counters';
import { ShortNumber } from 'mastodon/components/short_number';
import { me } from 'mastodon/initial_state';

const MessagesAllIcon = PendingMentionsIcon;
const MessagesAllActiveIcon = PendingMentionsActiveIcon;

const isAllMessagesPathname = (pathname) =>
  pathname === '/messages/all' || pathname.startsWith('/messages/all/');

const isMessagesAllPath = (_match, location) =>
  isAllMessagesPathname(location.pathname);

const isMessagesPath = (_match, location) =>
  !isAllMessagesPathname(location.pathname) &&
  (location.pathname === '/messages' ||
    location.pathname.startsWith('/messages/'));

const messages = defineMessages({
  home: { id: 'tabs_bar.home', defaultMessage: 'Home' },
  profile: { id: 'navigation_bar.my_profile', defaultMessage: 'Profile' },
  menu: { id: 'tabs_bar.menu', defaultMessage: 'Menu' },
  notifications: { id: 'tabs_bar.notifications', defaultMessage: 'Notifications' },
  explore: { id: 'explore.title', defaultMessage: 'Explore' },
  direct: { id: 'navigation_bar.direct', defaultMessage: 'Private mentions' },
  pendingMentions: { id: 'navigation_bar.pending-mentions', defaultMessage: 'Awaiting reply' },
  messages: { id: 'navigation_bar.messages', defaultMessage: 'Messages' },
  messagesAll: { id: 'navigation_bar.messages_all', defaultMessage: 'All messages' },
  bookmarks: { id: 'navigation_bar.bookmarks', defaultMessage: 'Bookmarks' },
  scheduledStatuses: { id: 'navigation_bar.scheduled_statuses', defaultMessage: 'Scheduled posts' },
  scheduledStatusesFailed: { id: 'navigation_bar.scheduled_statuses_failed', defaultMessage: 'Scheduled posts (failed)' },
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
})(({ account, avatarSize = 48, showCounts = false }) => {
  if (!account) {
    return null;
  }

  const getValue = (key) => (typeof account.get === 'function' ? account.get(key) : account[key]);

  const acct = getValue('acct');
  const displayName = getValue('display_name_html') || getValue('display_name') || getValue('username');

  return (
    <>
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

      {showCounts && (
        <ProfileCounts
          acct={acct}
          following={getValue('following_count')}
          followers={getValue('followers_count')}
        />
      )}
    </>
  );
});

const ProfileCounts = ({ acct, following, followers }) => (
  <div className='navigation-panel__profile-counts'>
    <Link to={`/@${acct}/following`}>
      <ShortNumber value={following} renderer={FollowingCounter} />
    </Link>
    <Link to={`/@${acct}/followers`}>
      <ShortNumber value={followers} renderer={FollowersCounter} />
    </Link>
  </div>
);
ProfileCounts.propTypes = {
  acct: PropTypes.string.isRequired,
  following: PropTypes.number,
  followers: PropTypes.number,
};

const ProfileSection = ({ avatarSize, showCounts }) => (
  <div className='navigation-panel__profile'>
    <ProfileSummary avatarSize={avatarSize} showCounts={showCounts} />
  </div>
);
ProfileSection.propTypes = {
  avatarSize: PropTypes.number,
  showCounts: PropTypes.bool,
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

const ProfileLink = () => {
  const intl = useIntl();
  const acct = useSelector(state => state.getIn(['accounts', me, 'acct']));

  const isActive = useCallback(
    (match, location) => !!acct && (location.pathname === `/@${acct}` || location.pathname.startsWith(`/@${acct}/`)),
    [acct],
  );

  if (!acct) return null;

  return (
    <ColumnLink
      transparent
      to={`/@${acct}`}
      isActive={isActive}
      icon='profile'
      iconComponent={ProfileIcon}
      activeIconComponent={ProfileActiveIcon}
      text={intl.formatMessage(messages.profile)}
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

const MessagesLink = () => {
  const dispatch = useDispatch();
  const count = useSelector(selectUnreadDmCount);
  const intl = useIntl();
  const label = intl.formatMessage(messages.messages);

  useEffect(() => {
    dispatch(fetchDmRooms({}));
  }, [dispatch]);

  return (
    <ColumnLink
      key='messages'
      transparent
      to='/messages'
      isActive={isMessagesPath}
      icon={<IconWithBadge id='messages' icon={MailIcon} count={count} className='column-link__icon' />}
      text={label}
    />
  );
};

const FollowRequestsLink = () => {
  const dispatch = useDispatch();
  const count = useSelector(state => state.getIn(['user_lists', 'follow_requests', 'items'])?.size ?? 0);
  const intl = useIntl();

  useEffect(() => {
    dispatch(fetchFollowRequests());
  }, [dispatch]);

  if (count < 1) {
    return null;
  }

  return (
    <ColumnLink
      key='follow_requests'
      transparent
      to='/follow_requests'
      icon={<IconWithBadge id='follow-requests' icon={FollowRequestsIcon} count={count} className='column-link__icon' />}
      activeIcon={<IconWithBadge id='follow-requests' icon={FollowRequestsActiveIcon} count={count} className='column-link__icon' />}
      text={intl.formatMessage(messages.followRequests)}
    />
  );
};

// No pending count: a queue that is simply waiting is not something the user has
// to act on. A failed publication still raises the red issue dot — without it, a
// post that never went out would be silently invisible.
const ScheduledStatusesLink = () => {
  const failed = useSelector(state => state.getIn(['scheduled_statuses', 'usage', 'failed'], 0));
  const intl = useIntl();
  const label = intl.formatMessage(failed > 0 ? messages.scheduledStatusesFailed : messages.scheduledStatuses);

  return (
    <ColumnLink
      key='scheduled_statuses'
      transparent
      to='/scheduled_statuses'
      icon={<IconWithBadge id='clock-o' icon={ScheduledStatusesIcon} count={0} issueBadge={failed > 0} className='column-link__icon' />}
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
    drawer: PropTypes.bool,
  };

  static defaultProps = {
    renderSearch: false,
    renderComposeButton: false,
    isBelowFullBreakpoint: false,
    isMobileBreakpoint: false,
  };

  isTimelineTabActive = (match, location) => {
    return match || TIMELINE_TAB_PATHS.includes(location.pathname);
  };

  render() {
    const { intl, isBelowFullBreakpoint, isMobileBreakpoint } = this.props;
    const { signedIn } = this.props.identity;

    const renderSearch = this.props.renderSearch ?? false;
    const renderComposeButton = this.props.renderComposeButton ?? false;
    const isFullView = !isBelowFullBreakpoint;
    const showIdentitySection = signedIn && !isFullView;
    const profileAvatarSize = isFullView ? 48 : 36;
    const isMobileDrawer = !!this.props.drawer;
    const profileSection = showIdentitySection && (
      <ProfileSection
        avatarSize={isMobileDrawer ? 44 : profileAvatarSize}
        showCounts={isMobileDrawer}
      />
    );

    const panelClassName = classNames('navigation-panel', {
      'navigation-panel--full': isFullView,
      'navigation-panel--compact': !isFullView,
      'navigation-panel--mobile': isMobileBreakpoint,
    });

    return (
      <div className={panelClassName}>
        {!isMobileDrawer && (
          <div className='navigation-panel__logo'>
            <Link to='/' className='column-link column-link--logo'><WordmarkLogo /></Link>
          </div>
        )}

        {isMobileDrawer && profileSection}

        {renderSearch && (
          <div className='navigation-panel__search'>
            <Search openInRoute singleColumn />
          </div>
        )}

        {!isMobileDrawer && profileSection}

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

        </div>

        <NavigationPortal />
      </div>
    );
  }
  renderSignedInLinks = (intl, includeAccountSwitcher = true) => {
    const { permissions } = this.props.identity;

    const homeLabel = intl.formatMessage(messages.home);
    const directLabel = intl.formatMessage(messages.direct);
    const pendingMentionsLabel = intl.formatMessage(messages.pendingMentions);
    const bookmarksLabel = intl.formatMessage(messages.bookmarks);
    const preferencesLabel = intl.formatMessage(messages.preferences);
    const listsLabel = intl.formatMessage(messages.lists);

    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
    const settingsHref = `${origin}/settings/profile`;

    const inBottomBar = !!this.props.drawer;

    return (
      <>
        {inBottomBar && <ProfileLink />}

        {!inBottomBar && (
          <>
            <ColumnLink transparent to='/home' isActive={this.isTimelineTabActive} icon='home' iconComponent={HomeIcon} activeIconComponent={HomeActiveIcon} text={homeLabel} />
            <NotificationsLink />
            <ColumnLink transparent to='/pending-mentions' icon='pending' iconComponent={PendingMentionsIcon} activeIconComponent={PendingMentionsActiveIcon} text={pendingMentionsLabel} />
          </>
        )}
        {dmChatEnabled ? (
          !inBottomBar && <MessagesLink />
        ) : (
          <ColumnLink transparent to='/conversations' icon='at' iconComponent={AlternateEmailIcon} text={directLabel} />
        )}
        {dmChatEnabled && canManageDirectMessages(permissions) && (
          <ColumnLink transparent to='/messages/all' isActive={isMessagesAllPath} icon='messages-all' iconComponent={MessagesAllIcon} activeIconComponent={MessagesAllActiveIcon} text={intl.formatMessage(messages.messagesAll)} />
        )}
        <ScheduledStatusesLink />
        <ColumnLink transparent to='/bookmarks' icon='bookmarks' iconComponent={BookmarksIcon} activeIconComponent={BookmarksActiveIcon} text={bookmarksLabel} />
        <ColumnLink transparent to='/lists' icon='list-ul' iconComponent={ListAltIcon} activeIconComponent={ListAltActiveIcon} text={listsLabel} />
        <ColumnLink transparent href={settingsHref} icon='cog' iconComponent={SettingsIcon} text={preferencesLabel} />
        <FollowRequestsLink />
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

const useDrawerFocusAndScrollLock = (active, wrapperRef) => {
  useEffect(() => {
    if (!active) return undefined;

    const root = document.documentElement;
    const returnFocus = document.activeElement;

    root.classList.add('navigation-panel-open');
    wrapperRef.current?.focus({ preventScroll: true });

    return () => {
      root.classList.remove('navigation-panel-open');

      if (!wrapperRef.current?.contains(document.activeElement)) return;

      const target = returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus !== document.body
        ? returnFocus
        : document.querySelector('.column-header__avatar-menu');

      target?.focus({ preventScroll: true });
    };
  }, [active, wrapperRef]);
};

const OVERLAY_ABOVE_DRAWER = '.account-switcher__manage-overlay, .modal-root__container';

const useCloseOnEscape = (open, dispatch) => {
  useEffect(() => {
    if (!open) return undefined;

    let handledAbove = false;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handledAbove = document.querySelector(OVERLAY_ABOVE_DRAWER) !== null;
      }
    };

    const handleKeyUp = (event) => {
      if (event.key !== 'Escape') return;

      if (!handledAbove) {
        dispatch(closeNavigation());
      }

      handledAbove = false;
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [open, dispatch]);
};

export const CollapsibleNavigationPanel = () => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const navigationOpen = useSelector(state => state.getIn(['navigation', 'open'], false));
  const isMobile = useBreakpoint('openable');
  const location = useLocation();
  const wrapperRef = useRef(null);
  const openRef = useRef(navigationOpen);
  const shouldShowOverlay = isMobile && navigationOpen;

  openRef.current = navigationOpen;

  useEffect(() => {
    if (openRef.current) dispatch(closeNavigation());
  }, [location.pathname, dispatch]);

  useCloseOnEscape(navigationOpen, dispatch);
  useDrawerFocusAndScrollLock(shouldShowOverlay, wrapperRef);

  useEffect(() => {
    if (!isMobile && navigationOpen) {
      dispatch(closeNavigation());
    }
  }, [isMobile, navigationOpen, dispatch]);

  useEffect(() => () => {
    dispatch(closeNavigation());
  }, [dispatch]);

  const handleOverlayClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      dispatch(closeNavigation());
    }
  }, [dispatch]);

  const handleLinkClickCapture = useCallback((event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('a[href]')) {
      dispatch(closeNavigation());
    }
  }, [dispatch]);

  const containerClassName = classNames('navigation-panel__container', {
    'navigation-panel__container--overlay': shouldShowOverlay,
  });

  const wrapperClassName = classNames('navigation-panel__wrapper', {
    'navigation-panel__wrapper--open': !isMobile || navigationOpen,
  });

  return createPortal(
    <div
      className={containerClassName}
      onClick={shouldShowOverlay ? handleOverlayClick : undefined}
    >
      <div
        ref={wrapperRef}
        className={wrapperClassName}
        tabIndex={-1}
        role={shouldShowOverlay ? 'dialog' : undefined}
        aria-modal={shouldShowOverlay ? true : undefined}
        aria-label={shouldShowOverlay ? intl.formatMessage(messages.menu) : undefined}
        onClickCapture={handleLinkClickCapture}
      >
        <NavigationPanelWithBreakpoints
          renderSearch
          renderComposeButton={!isMobile}
          drawer
        />
      </div>
    </div>,
    document.body,
  );
};
