// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
//   전체 메시지. /messages/all
//
//   레이아웃은 메시지 화면 것을 그대로 쓴다 — 같은 셸(body.layout-messages),
//   같은 3열 그리드(.dm-shell). 다른 것은 **데이터와 권한**뿐이다.
//
//   라우트도 같은 방식으로 부모/자식이다. 목록이 언마운트되지 않아야 방을 옮길
//   때마다 다시 불러오지 않는다.
//
//   **권한은 두 겹이다.** 여기서 한 번(화면 진입), 서버에서 한 번
//   (Admin::DirectMessagePolicy). 화면 쪽만 막으면 API 를 직접 부르면 그만이므로
//   서버 쪽이 진짜 방어선이고, 여기는 "권한 없는 사람에게 빈 화면을 보여주지
//   않기" 위한 것이다.

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Helmet } from 'react-helmet';
import { Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';

import MessagesIcon from '@/styles/bird-theme-svg/envelope.svg?react';
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
          defaultMessage='Staff-only page'
        />
      </h2>

      {/* 이 화면이 무엇인지와 **다른 계정에 권한을 주는 법**을 함께 적는다.
          권한을 어디서 주는지 모르면 이 화면의 존재를 알아도 쓸 수가 없다. */}
      <p>
        <FormattedMessage
          id='messages.admin.pick_body'
          defaultMessage='Every conversation on this server appears here. To let another account see all conversations, give it the Admin role in Preferences → Administration → Roles.'
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

  useMessagesLayout(allowed, Boolean(roomMatch));

  // 권한이 없으면 자기 대화 화면으로 돌린다. 여기가 있다는 사실 자체를 알릴
  // 이유가 없다.
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
