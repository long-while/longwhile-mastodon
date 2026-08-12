// @_longwhile custom feature

import { useCallback, useEffect } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Helmet } from 'react-helmet';
import { Redirect, Route, Switch, useHistory, useRouteMatch } from 'react-router-dom';

import MessagesIcon from '@/images/message-circle.svg?react';
import { openModal } from 'mastodon/actions/modal';
import { connectDmChatStream } from 'mastodon/actions/streaming';
import { Icon } from 'mastodon/components/icon';
import { NotSignedInIndicator } from 'mastodon/components/not_signed_in_indicator';
import { useIdentity } from 'mastodon/identity_context';
import { dmChatEnabled } from 'mastodon/initial_state';
import { useAppDispatch } from 'mastodon/store';

import { RoomList } from './components/room_list';
import { useMessagesLayout } from './components/shell';
import Room from './room';

const messages = defineMessages({
  title: { id: 'column.messages', defaultMessage: 'Messages' },
  compose: { id: 'messages.compose', defaultMessage: 'New message' },
});

const NoRoomSelected: React.FC = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const history = useHistory();

  const handleCompose = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'DM_RECIPIENT',
        modalProps: {
          onCreated: (roomId: string) => {
            history.push(`/messages/${roomId}`);
          },
        },
      }),
    );
  }, [dispatch, history]);

  return (
  <div className='dm-room dm-room--empty'>
    <div className='dm-room__placeholder'>
      <div className='dm-room__placeholder__icon'>
        <Icon id='message-circle' icon={MessagesIcon} />
      </div>

      <h2>
        <FormattedMessage
          id='messages.empty_room.title'
          defaultMessage='Start a conversation'
        />
      </h2>

      <p>
        <FormattedMessage
          id='messages.empty_room.body'
          defaultMessage='Pick one from the list, or start a new one.'
        />
      </p>

      <button
        type='button'
        className='dm-room__placeholder__action'
        onClick={handleCompose}
      >
        {intl.formatMessage(messages.compose)}
      </button>
    </div>
  </div>
  );
};

const Messages: React.FC = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const { signedIn } = useIdentity();
  const roomMatch = useRouteMatch('/messages/:roomId');

  useMessagesLayout(Boolean(dmChatEnabled) && signedIn, Boolean(roomMatch));

  const active = Boolean(dmChatEnabled) && signedIn;

  useEffect(() => {
    if (!active) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const disconnect = dispatch(connectDmChatStream()) as unknown as () => void;

    return () => {
      disconnect();
    };
  }, [dispatch, active]);

  if (!dmChatEnabled) return <Redirect to='/conversations' />;

  if (!signedIn) return <NotSignedInIndicator />;

  return (
    <div
      className={classNames('dm-shell', {
        'dm-shell--room-open': Boolean(roomMatch),
      })}
    >
      <div className='dm-shell__list'>
        <RoomList />
      </div>

      <div className='dm-shell__thread'>
        <Switch>
          <Route path='/messages/:roomId' component={Room} />
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
export default Messages;
