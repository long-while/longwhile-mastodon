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

// @_longwhile — 운영진의 "모든 채팅" 아이콘.
//   답장할 멘션과 **같은 그림**을 쓴다. 같은 파일을 두 번 import 하면 중복
//   import 로 잡히므로 별칭만 둔다.
//   두 항목이 한 내비에 나란히 서면 그림이 겹친다 — 운영진에게만 보이는 항목이라
//   당장은 헷갈릴 자리가 좁지만, 서로 다른 그림을 쓰는 편이 낫다.
const MessagesAllIcon = PendingMentionsIcon;
const MessagesAllActiveIcon = PendingMentionsActiveIcon;

// @_longwhile — 채팅 두 항목의 활성 판정.
//
//   상류의 `exact` 로는 `/messages/3` 에서 "채팅" 이 꺼진다. 그렇다고 접두사
//   일치로 두면 `/messages/all/3` 에서 **둘 다** 켜진다 — 두 항목이 경로를
//   나눠 갖고 있기 때문이다. 그래서 판정을 여기서 직접 적는다.
//
//     /messages          채팅
//     /messages/3        채팅
//     /messages/all      모든 채팅
//     /messages/all/3    모든 채팅
//
//   `/messages/all` 로 시작하는지를 먼저 본다. 순서를 뒤집으면 "채팅" 이 운영진
//   화면까지 가져간다.
//   시그니처는 react-router 의 것이다 — `(match, location)`. NavLink 는 경로가
//   맞지 않아도 이 함수를 부르므로(`match` 가 null 인 채로) `location` 만 본다.
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

      {/* 카드 바깥에 둔다 — 카드 전체가 링크라 안에 넣으면 링크가 겹친다. */}
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

// @_longwhile — 모바일 서랍 맨 위(하단 막대로 옮겨 간 "홈" 이 있던 자리)의 내 프로필.
//   이 항목에는 테마의 `order` 규칙이 없어 기본값 0 이 되므로 홈(1)보다 위,
//   맨 위에 온다 — 여기서는 **일부러** 그렇게 둔다(CLAUDE.md 의 내비게이션 순서).
//   아이콘은 테마가 원본 path 를 지우므로 `.icon-profile` 마스크 규칙이 테마
//   single-column 두 파일에 함께 있다. 서랍은 단일 칼럼에서만 그려진다.
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

// ─── @_longwhile — 안 읽은 DM 배지 ───
//   알림과 같은 모양으로 안 읽은 **메시지 수**를 띄운다. 방 수가 아니라 메시지
//   수인 이유는 목록 카드가 방마다 같은 기준으로 숫자를 보이기 때문이다 — 두
//   숫자가 다른 것을 세면 배지와 목록이 어긋나 보인다.
//
//   **항목 자체는 늘 보인다.** 팔로우 요청과 다르다. 그쪽은 승인제를 안 쓰면
//   평생 0 이라 감췄지만, 메시지는 배지가 0 이어도 들어갈 일이 있는 화면이다.
//
//   개수는 목록에서 센다. 서버가 총합만 주는 API 가 따로 없고, 어차피 눌러
//   들어가면 같은 목록을 쓴다. 새 DM 이 오면 user 스트림의 `conversation` 이
//   dmChatStreamUpdate 를 깨워 목록을 다시 읽으므로(actions/streaming.js) 새로
//   고치지 않아도 배지가 는다. 읽으면 markDmRoomRead 응답이 그 방의 unread_count
//   를 0 으로 만들어 배지가 준다.
//
//   아이콘은 테마 SCSS 가 mask-image 로 갈아 끼운다(.icon-messages →
//   bird-theme-svg/envelope). IconWithBadge 가 감싸도 `.icon-messages` 는 그대로
//   붙으므로 알림(.icon-bell)과 같은 방식으로 동작한다.
const MessagesLink = () => {
  const dispatch = useDispatch();
  const count = useSelector(selectUnreadDmCount);
  const intl = useIntl();
  const label = intl.formatMessage(messages.messages);

  // **인자 없이 부르지 않는다.** createAsyncThunk 는 넘긴 것을 그대로 `meta.arg`
  // 로 싣는데, 아무것도 안 넘기면 그것이 `undefined` 가 된다. fulfilled 리듀서가
  // 거기서 `meta.arg.refresh` 를 읽으므로 **리듀서가 통째로 터지고**, 상태가
  // pending 인 채로 남아 목록이 비고 배지가 0 이 된다.
  //
  // 새로고침하면 배지가 사라지던 것이 이것이다. 스트림이 부르는 쪽은
  // `{ refresh: true }` 를 넘겨서 멀쩡했고, 그래서 **DM 이 새로 와야만 배지가
  // 살아나는** 모양이 됐다.
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

// ─── @_longwhile — 들어온 팔로우 요청 ───
//   **요청이 하나라도 있을 때만 나타난다.** 승인제를 쓰지 않는 사용자에게는
//   평생 0 인 항목이라, 늘 띄워두면 자리만 차지한다.
//
//   개수는 목록에서 센다. 서버가 개수만 주는 API 가 따로 없고, 어차피 눌러
//   들어가면 같은 목록을 쓴다. 새 요청은 알림 스트림을 타고 리듀서가 목록 앞에
//   끼워 넣으므로(reducers/user_lists.js), 새로고침하지 않아도 배지가 는다.
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
    // 모바일 서랍 안에 그려질 때(CollapsibleNavigationPanel). 폭이 아니라 이것으로
    // 정한다 — 폭 기준(760)과 레이아웃 기준(759)이 1px 어긋나, 760px 에서는
    // 오른쪽 고정 패널이 서랍 모양으로 그려졌다.
    drawer: PropTypes.bool,
  };

  static defaultProps = {
    renderSearch: false,
    renderComposeButton: false,
    isBelowFullBreakpoint: false,
    isMobileBreakpoint: false,
  };

  // 퍼블릭은 홈 위의 탭으로 간다(TimelineTabs). 그 탭에 있을 때도 홈을 켠다.
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
    // @_longwhile — 모바일 서랍은 X 처럼 내 프로필로 시작한다. 로고는 빼고,
    // 프로필을 검색칸보다 위로 올리고, 팔로잉·팔로워 수를 함께 보인다.
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

    // @_longwhile — 모바일 서랍에서는 하단 막대에 이미 있는 넷(홈·답장할 멘션·
    //   알림·채팅)을 빼고 그린다. 두 군데에 같은 항목이 있으면 서랍만 길어진다.
    //   하단 막대와 짝이다(navigation_bar.tsx). PC 사이드바는 그대로다.
    //   JSX 에서 빼므로 테마의 `order` 규칙은 건드리지 않는다 — PC 에서 쓴다.
    const inBottomBar = !!this.props.drawer;

    return (
      <>
        {inBottomBar && <ProfileLink />}

        {/* 퍼블릭 항목은 없앴다 — 홈 위의 탭으로 간다. 테마의 `order` 규칙도
            네 파일에서 함께 지웠다(CLAUDE.md 의 내비게이션 순서 항목). */}
        {!inBottomBar && (
          <>
            <ColumnLink transparent to='/home' isActive={this.isTimelineTabActive} icon='home' iconComponent={HomeIcon} activeIconComponent={HomeActiveIcon} text={homeLabel} />
            <NotificationsLink />
            <ColumnLink transparent to='/pending-mentions' icon='pending' iconComponent={PendingMentionsIcon} activeIconComponent={PendingMentionsActiveIcon} text={pendingMentionsLabel} />
          </>
        )}
        {/* @_longwhile — 채팅과 기존 다이렉트 타임라인을 최상위에 함께 두지 않는다.
            둘 다 있으면 사용자가 차이를 알 수 없다. 채팅이 켜져 있으면 그것만
            내비에 두고, 기존 화면은 /conversations 로 여전히 열린다 —
            3인 이상 대화가 그리로 떨어지므로 경로 자체는 살아 있어야 한다.
            (기획서 오픈 이슈 OI-10)

            아이콘은 테마 SCSS 가 mask-image 로 갈아 끼운다
            (.icon-messages → bird-theme-svg/envelope). 아래의 MailIcon 은
            테마를 쓰지 않는 기본 화면용 원본이다. */}
        {dmChatEnabled ? (
          !inBottomBar && <MessagesLink />
        ) : (
          <ColumnLink transparent to='/conversations' icon='at' iconComponent={AlternateEmailIcon} text={directLabel} />
        )}
        {/* @_longwhile — 운영진의 DM 전체 열람. 판정은 서버의
            Admin::DirectMessagePolicy(`administrator` 또는 `manage_roles`)와 같게
            맞춘다. 여기서 감추는 것은 편의일 뿐이고, 진짜 방어선은 API 쪽이다. */}
        {dmChatEnabled && canManageDirectMessages(permissions) && (
          <ColumnLink transparent to='/messages/all' isActive={isMessagesAllPath} icon='messages-all' iconComponent={MessagesAllIcon} activeIconComponent={MessagesAllActiveIcon} text={intl.formatMessage(messages.messagesAll)} />
        )}
        <ScheduledStatusesLink />
        <ColumnLink transparent to='/bookmarks' icon='bookmarks' iconComponent={BookmarksIcon} activeIconComponent={BookmarksActiveIcon} text={bookmarksLabel} />
        <ColumnLink transparent to='/lists' icon='list-ul' iconComponent={ListAltIcon} activeIconComponent={ListAltActiveIcon} text={listsLabel} />
        <ColumnLink transparent href={settingsHref} icon='cog' iconComponent={SettingsIcon} text={preferencesLabel} />
        {/* 계정 전환 **위**. 요청이 없으면 아무것도 그리지 않는다.
            실제 순서는 테마 SCSS 의 `order` 가 정하므로(CLAUDE.md 맨 앞의 함정)
            네 파일에서 팔로우 요청 12 / 계정 전환 13 으로 함께 바꿨다. 여기
            순서는 DOM 순서일 뿐이지만, 둘이 어긋나 있으면 다음 사람이 JSX 만
            보고 잘못 읽는다. */}
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

// 서랍이 열려 있는 동안: 뒤의 페이지가 스크롤되지 않게 막고(iOS 에서 어두운
// 바깥을 끌면 타임라인이 움직였다), 포커스를 서랍으로 옮겼다가 닫히면 연
// 자리(헤더의 사진)로 돌려준다. 서랍 안의 첫 링크가 아니라 서랍 자체에 둔다 —
// 검색칸이 먼저 잡히면 모바일 키보드가 튀어나온다.
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

      // 링크를 눌러 화면이 바뀌었으면 연 단추는 이미 사라졌다. 새 화면 헤더의
      // 사진으로 돌려준다(iOS 에서는 연 자리가 body 인 경우도 있다).
      const target = returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus !== document.body
        ? returnFocus
        : document.querySelector('.column-header__avatar-menu');

      target?.focus({ preventScroll: true });
    };
  }, [active, wrapperRef]);
};

// 서랍 위에 뜬 창(계정 관리, 일반 모달)이 Esc 를 먼저 쓴다.
const OVERLAY_ABOVE_DRAWER = '.account-switcher__manage-overlay, .modal-root__container';

// 위의 창들은 `keydown` 에서 닫히고 서랍은 `keyup` 에서 닫혀서, Esc 한 번에
// 둘 다 닫혔다. 키를 누른 순간(캡처 단계 — 그 창이 닫히기 전)에 위에 창이
// 있었으면 그 Esc 는 서랍 몫이 아니다.
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

  // 코드로 화면이 바뀌어도(검색 등) 닫는다. 닫혀 있으면 아무것도 보내지 않는다.
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

  // 열린 채로 사라지면(화면을 넓혀 모바일 레이아웃을 벗어나면) 닫아 둔다. 안
  // 그러면 `navigation.open` 이 남아, 다시 좁혔을 때 서랍이 저절로 열린다.
  useEffect(() => () => {
    dispatch(closeNavigation());
  }, [dispatch]);

  const handleOverlayClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      dispatch(closeNavigation());
    }
  }, [dispatch]);

  // 서랍 안의 링크를 누르면 닫는다. 주소가 바뀔 때만 닫으면, 지금 보고 있는
  // 화면의 항목(홈에서 "홈")을 눌렀을 때 서랍이 그대로 남는다.
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

  // @_longwhile — 서랍은 `document.body` 로 꺼낸다.
  //
  //   제자리(`.columns-area__panels` 안)에 두면 하단 막대 위로 올라갈 수 없다.
  //   bird-ui 가 그 요소에 `z-index: 2` 를 주는데, `.ui` 의 flex 자식이라 거기서
  //   쌓임 맥락이 새로 생긴다. 그 안에서는 z-index 를 얼마로 올려도 바깥의
  //   막대(z 40)와는 2 로 비교된다.
  //
  //   닫혀 있을 때 화면 밖의 링크로 포커스가 들어가지 않는 것은 CSS 의
  //   `visibility` 가 맡는다(components.scss 의 서랍 블록).
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
        {/* @_longwhile — 모바일 서랍에서는 '새 게시물' 단추와 로고를 두지 않는다.
            같은 화면 오른쪽 아래에 띄우기 단추(FAB)가 이미 있어 둘이 겹친다. */}
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
