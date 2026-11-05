// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   메시지 셸. /messages 와 /messages/:roomId 를 함께 맡는다.
//   근거: dm-chat-phase-2.md §3, 기획서 §4.2
//
//   **라우트를 부모와 자식으로 나눈 것이 요점이다.**
//
//     /messages           목록 + 빈 상태
//     /messages/:roomId   목록 + 대화방
//
//   목록은 이 컴포넌트가 들고 있고 방만 자식 Route 로 갈아 끼운다. 두 경로가 각각
//   목록을 렌더하면 방을 옮길 때마다 목록이 언마운트돼 다시 불러오고 스크롤이
//   맨 위로 튄다.

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

// 방을 고르지 않았을 때 오른쪽에 놓이는 화면. 3열에서만 보인다 — 좁은 화면에서는
// 목록이 그 자리를 쓴다.
const NoRoomSelected: React.FC = () => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const history = useHistory();

  // 목록 헤더의 새 대화 버튼과 **같은 모달을 연다.** 빈 화면에서 다음에 할 일이
  // 하나뿐인데 그 길이 좌측 헤더의 작은 버튼밖에 없으면 찾기 어렵다.
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

  // 이 화면에 있는 동안만 작성창 패널을 감추고 내비를 아이콘 레일로 좁힌다.
  // 셸을 실제로 그릴 때만 켠다 — 안내문만 띄우는 경우까지 켜면 내비만 좁아진다.
  useMessagesLayout(Boolean(dmChatEnabled) && signedIn, Boolean(roomMatch));

  // 실시간 수신은 **셸에서 한 번** 구독하고 방을 옮겨도 유지한다. 방마다
  // 재구독하면 전환하는 사이에 온 메시지를 놓친다. (dm-chat-phase-3.md §1.3)
  const active = Boolean(dmChatEnabled) && signedIn;

  useEffect(() => {
    if (!active) return undefined;

    // dispatch 의 반환 타입이 살아 있지 않다(이 저장소의 rootReducer 가 any 로
    // 선언되어 있다). 구독 해제 함수를 받아야 하므로 형태만 다시 붙인다.
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const disconnect = dispatch(connectDmChatStream()) as unknown as () => void;

    return () => {
      disconnect();
    };
  }, [dispatch, active]);

  // 플래그가 꺼져 있으면 기존 대화 화면으로 되돌린다. URL 을 직접 쳐도 마찬가지다.
  // (dm-chat-plan.md §4.1)
  if (!dmChatEnabled) return <Redirect to='/conversations' />;

  if (!signedIn) return <NotSignedInIndicator />;

  return (
    // 좁은 화면에서 목록과 대화방 중 무엇을 보일지는 이 클래스가 정한다. CSS 의
    // :has() 로도 되지만 브라우저 지원 폭이 갈려, 라우터가 아는 사실을 그대로
    // 클래스로 내려 준다.
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
        {/* 대화 목록은 검색엔진에 올라가면 안 된다. 기존 direct_timeline 도 같다. */}
        <meta name='robots' content='noindex' />
      </Helmet>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Messages;
