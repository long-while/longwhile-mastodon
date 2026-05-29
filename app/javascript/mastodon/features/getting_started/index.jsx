import PropTypes from 'prop-types';

import { defineMessages, injectIntl } from 'react-intl';

import { Helmet } from 'react-helmet';

import { List as ImmutableList } from 'immutable';
import ImmutablePropTypes from 'react-immutable-proptypes';
import ImmutablePureComponent from 'react-immutable-pure-component';
import { connect } from 'react-redux';

import AlternateEmailIcon from '@/material-icons/400-24px/mail.svg?react';
import BookmarksIcon from '@/material-icons/400-24px/bookmarks-fill.svg?react';
import ModerationIcon from '@/material-icons/400-24px/gavel.svg?react';
import ListAltIcon from '@/material-icons/400-24px/list_alt.svg?react';
import AdministrationIcon from '@/material-icons/400-24px/manufacturing.svg?react';
import MenuIcon from '@/material-icons/400-24px/menu.svg?react';
import PersonAddIcon from '@/material-icons/400-24px/person_add.svg?react';
import SettingsIcon from '@/material-icons/400-24px/settings-fill.svg?react';
import StarIcon from '@/material-icons/400-24px/star.svg?react';
import { fetchFollowRequests } from 'mastodon/actions/accounts';
import Column from 'mastodon/components/column';
import ColumnHeader from 'mastodon/components/column_header';
import { LinkFooter } from 'mastodon/features/ui/components/link_footer';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { canManageReports, canViewAdminDashboard } from 'mastodon/permissions';

import { me, showTrends } from '../../initial_state';
import { NavigationBar } from '../compose/components/navigation_bar';
import ColumnLink from '../ui/components/column_link';

import TrendsContainer from './containers/trends_container';

const messages = defineMessages({
  direct: { id: 'navigation_bar.direct', defaultMessage: 'Private mentions' },
  bookmarks: { id: 'navigation_bar.bookmarks', defaultMessage: 'Bookmarks' },
  preferences: { id: 'navigation_bar.preferences', defaultMessage: 'Preferences' },
  administration: { id: 'navigation_bar.administration', defaultMessage: 'Administration' },
  moderation: { id: 'navigation_bar.moderation', defaultMessage: 'Moderation' },
  follow_requests: { id: 'navigation_bar.follow_requests', defaultMessage: 'Follow requests' },
  favourites: { id: 'navigation_bar.favourites', defaultMessage: 'Favorites' },
  lists: { id: 'navigation_bar.lists', defaultMessage: 'Lists' },
  menu: { id: 'getting_started.heading', defaultMessage: 'Getting started' },
});

const mapStateToProps = state => ({
  myAccount: state.getIn(['accounts', me]),
  unreadFollowRequests: state.getIn(['user_lists', 'follow_requests', 'items'], ImmutableList()).size,
});

const mapDispatchToProps = dispatch => ({
  fetchFollowRequests: () => dispatch(fetchFollowRequests()),
});

const badgeDisplay = (number, limit) => {
  if (number === 0) {
    return undefined;
  } else if (limit && number >= limit) {
    return `${limit}+`;
  } else {
    return number;
  }
};

class GettingStarted extends ImmutablePureComponent {
  static propTypes = {
    identity: identityContextPropShape,
    intl: PropTypes.object.isRequired,
    myAccount: ImmutablePropTypes.record,
    multiColumn: PropTypes.bool,
    fetchFollowRequests: PropTypes.func.isRequired,
    unreadFollowRequests: PropTypes.number,
    unreadNotifications: PropTypes.number,
  };

  componentDidMount () {
    const { fetchFollowRequests } = this.props;
    const { signedIn } = this.props.identity;

    if (!signedIn) {
      return;
    }

    fetchFollowRequests();
  }

  render () {
    const { intl, myAccount, multiColumn, unreadFollowRequests } = this.props;
    const { signedIn, permissions } = this.props.identity;

    const navItems = [];

    if (signedIn) {
      navItems.push(
        <ColumnLink key='direct' icon='at' iconComponent={AlternateEmailIcon} text={intl.formatMessage(messages.direct)} to='/conversations' />,
        <ColumnLink key='bookmark' icon='bookmarks' iconComponent={BookmarksIcon} text={intl.formatMessage(messages.bookmarks)} to='/bookmarks' />,
        <ColumnLink key='favourites' icon='star' iconComponent={StarIcon} text={intl.formatMessage(messages.favourites)} to='/favourites' />,
        <ColumnLink key='lists' icon='list-ul' iconComponent={ListAltIcon} text={intl.formatMessage(messages.lists)} to='/lists' />,
      );

      if (myAccount.get('locked') || unreadFollowRequests > 0) {
        navItems.push(<ColumnLink key='follow_requests' icon='user-plus' iconComponent={PersonAddIcon} text={intl.formatMessage(messages.follow_requests)} badge={badgeDisplay(unreadFollowRequests, 40)} to='/follow_requests' />);
      }

      navItems.push(
        <ColumnLink key='preferences' icon='cog' iconComponent={SettingsIcon} text={intl.formatMessage(messages.preferences)} href='/settings/preferences' />,
      );

      if (canManageReports(permissions)) {
        navItems.push(<ColumnLink key='moderation' href='/admin/reports' icon='flag' iconComponent={ModerationIcon} text={intl.formatMessage(messages.moderation)} />);
      }
      if (canViewAdminDashboard(permissions)) {
        navItems.push(<ColumnLink key='administration' href='/admin/dashboard' icon='tachometer' iconComponent={AdministrationIcon} text={intl.formatMessage(messages.administration)} />);
      }
    }

    return (
      <Column>
        {(signedIn && !multiColumn) ? <NavigationBar /> : <ColumnHeader title={intl.formatMessage(messages.menu)} icon='bars' iconComponent={MenuIcon} multiColumn={multiColumn} />}

        <div className='getting-started scrollable scrollable--flex'>
          <div className='getting-started__wrapper'>
            {navItems}
          </div>

          {!multiColumn && <div className='flex-spacer' />}

          <LinkFooter multiColumn />
        </div>

        {(multiColumn && showTrends) && <TrendsContainer />}

        <Helmet>
          <title>{intl.formatMessage(messages.menu)}</title>
          <meta name='robots' content='noindex' />
        </Helmet>
      </Column>
    );
  }

}

export default withIdentity(connect(mapStateToProps, mapDispatchToProps)(injectIntl(GettingStarted)));
