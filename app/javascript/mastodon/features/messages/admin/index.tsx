// @_longwhile custom feature

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Helmet } from 'react-helmet';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';

import MessagesIcon from '@/material-icons/400-24px/mail.svg?react';
import { Icon } from 'mastodon/components/icon';
import { useIdentity } from 'mastodon/identity_context';
import { dmChatEnabled } from 'mastodon/initial_state';
import { canManageDirectMessages } from 'mastodon/permissions';

import { useMessagesLayout } from '../components/shell';

import { AdminRoom } from './room';
import { AdminRoomList } from './room_list';

const messages = defineMessages({
  title: { id: 'column.messages_all', defaultMessage: 'All messages' },
});

const NoRoomSelected: React.FC = () => (
  <div className='dm-room dm-room--empty'>
    <div className='dm-room__placeholder'>
      <div className='dm-room__placeholder__icon'>
        <Icon id='messages' icon={MessagesIcon} />
      </div>

      <h2>
        <FormattedMessage
          id='messages.admin.pick_title'
          defaultMessage='Pick a conversation'
        />
      </h2>

      <p>
        <FormattedMessage
          id='messages.admin.pick_body'
          defaultMessage='Conversations are read-only here.'
        />
      </p>
    </div>
  </div>
);

const AdminMessages: React.FC = () => {
  const intl = useIntl();
  const { signedIn, permissions } = useIdentity();
  const roomMatch = useRouteMatch('/messages/all/:roomId');

  const allowed =
    Boolean(dmChatEnabled) &&
    signedIn &&
    canManageDirectMessages(permissions);

  useMessagesLayout(allowed);

  if (!allowed) return <Redirect to='/messages' />;

  return (
    <div
      className={classNames('dm-shell', {
        'dm-shell--room-open': Boolean(roomMatch),
      })}
    >
      <div className='dm-shell__list'>
        <AdminRoomList />
      </div>

      <div className='dm-shell__thread'>
        <Switch>
          <Route path='/messages/all/:roomId' component={AdminRoom} />
          <Route component={NoRoomSelected} />
        </Switch>
      </div>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default AdminMessages;
