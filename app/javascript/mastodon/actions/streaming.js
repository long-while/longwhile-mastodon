// @ts-check

import { dmChatEnabled, me } from '../initial_state';
import { getLocale } from '../locales';
import { connectStream } from '../stream';

import {
  fetchAnnouncements,
  updateAnnouncements,
  updateReaction as updateAnnouncementsReaction,
  deleteAnnouncement,
} from './announcements';
import { updateConversations } from './conversations';
import { dmChatStreamUpdate, dmMessageReceived, setDmStreamConnected, updateDmReadState } from './dm_rooms';
import { processNewNotificationForGroups, refreshStaleNotificationGroups, pollRecentNotifications as pollRecentGroupNotifications } from './notification_groups';
import { updateNotifications } from './notifications';
import { updateStatus } from './statuses';
import {
  updateTimeline,
  deleteFromTimelines,
  expandHomeTimeline,
  connectTimeline,
  disconnectTimeline,
  fillHomeTimelineGaps,
  fillPublicTimelineGaps,
  fillCommunityTimelineGaps,
  fillListTimelineGaps,
} from './timelines';

/**
 * @param {number} max
 * @returns {number}
 */
const randomUpTo = max =>
  Math.floor(Math.random() * Math.floor(max));

/**
 * @param {string} timelineId
 * @param {string} channelName
 * @param {Object.<string, string>} params
 * @param {Object} options
 * @param {function(Function, Function): Promise<void>} [options.fallback]
 * @param {function(): void} [options.fillGaps]
 * @param {function(import('../api_types/statuses').ApiStatusJSON): boolean} [options.accept]
 * @param {boolean} [options.updatesOnly] 같은 채널을 이미 다른 구독이 듣고 있을 때 씀.
 *   알림·대화·공지 같은 채널 전역 이벤트를 무시하고 새 툿만 받는다. 이걸 안 하면
 *   한 채널을 두 번 구독했을 때 알림이 두 번 디스패치된다.
 * @returns {function(): void}
 */
export const connectTimelineStream = (timelineId, channelName, params = {}, options = {}) => {
  const { messages } = getLocale();

  return connectStream(channelName, params, (dispatch, getState) => {
    const locale = getState().getIn(['meta', 'locale']);

    // @ts-expect-error
    let pollingId;

    /**
     * @param {function(Function, Function): Promise<void>} fallback
     */

    const useFallback = async fallback => {
      await fallback(dispatch, getState);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- this is not a react hook
      pollingId = setTimeout(() => useFallback(fallback), 20000 + randomUpTo(20000));
    };

    return {
      onConnect() {
        dispatch(connectTimeline(timelineId));

        // @ts-expect-error
        if (pollingId) {
          // @ts-ignore
          clearTimeout(pollingId); pollingId = null;
        }

        if (options.fillGaps) {
          dispatch(options.fillGaps());
        }
      },

      onDisconnect() {
        dispatch(disconnectTimeline({ timeline: timelineId }));

        if (options.fallback) {
          // @ts-expect-error
          pollingId = setTimeout(() => useFallback(options.fallback), randomUpTo(40000));
        }
      },

      onReceive(data) {
        // 채널 전역 이벤트는 그 채널의 주 구독자가 이미 처리한다. 여기서 또 하면
        // 알림이 두 번 뜬다.
        if (options.updatesOnly && data.event !== 'update') {
          return;
        }

        switch (data.event) {
        case 'update':
          // @ts-expect-error
          dispatch(updateTimeline(timelineId, JSON.parse(data.payload), options.accept));
          break;
        case 'status.update':
          // @ts-expect-error
          dispatch(updateStatus(JSON.parse(data.payload)));
          break;
        case 'delete':
          dispatch(deleteFromTimelines(data.payload));
          break;
        case 'notification': {
          // @ts-expect-error
          const notificationJSON = JSON.parse(data.payload);

          // @_longwhile — DM 은 알림함에 올리지 않는다.
          //
          //   서버는 direct 멘션에도 알림 레코드를 만들어 이 이벤트를 쏜다. API 로
          //   도는 자동봇이 그것으로 명령어를 받기 때문이다(NotifyService). 목록
          //   조회는 Notification.browserable 이 이미 거르므로, 실시간으로 들어오는
          //   이 한 줄만 여기서 막으면 사람 화면에서는 새로고침 전후가 같다.
          //
          //   알림 소리도 updateNotifications 안에서 울린다. 여기서 끊어야 채팅
          //   도착 소리(아래 conversation 갈래)와 두 번 겹치지 않는다.
          if (dmChatEnabled && notificationJSON.type === 'mention' && notificationJSON.status?.visibility === 'direct') {
            break;
          }

          dispatch(updateNotifications(notificationJSON, messages, locale));
          // TODO: remove this once the groups feature replaces the previous one
          dispatch(processNewNotificationForGroups(notificationJSON));
          break;
        }
        case 'notifications_merged': {
          dispatch(refreshStaleNotificationGroups());
          break;
        }
        case 'conversation': {
          // @ts-expect-error
          const conversation = JSON.parse(data.payload);

          dispatch(updateConversations(conversation));

          // @_longwhile — 내비의 안 읽은 DM 배지. (navigation_panel 의 MessagesLink)
          //
          //   user 스트림은 앱이 켜져 있는 내내 붙어 있는 유일한 채널이다. DM
          //   전용 스트림(connectDmChatStream)은 /messages 에 있는 동안만 붙으므로,
          //   다른 화면에 있을 때 온 DM 을 그것으로는 알 수 없다.
          //
          //   dmChatStreamUpdate 를 쓴다. 400ms 로 묶여 있어 여러 줄이 연달아 와도
          //   왕복이 한 번이고, /messages 에 있을 때 DM 스트림이 부르는 것과 **같은
          //   타이머를 공유**해 두 스트림이 겹쳐도 요청이 두 배가 되지 않는다.
          //
          //   기능이 꺼져 있으면 부르지 않는다. /api/v1/dm_rooms 가 404 라
          //   (Api::DmRoomAccess) 새 DM 이 올 때마다 오류 배너가 뜬다.
          if (dmChatEnabled) {
            dispatch(dmChatStreamUpdate());

            // 도착 소리. 알림에서 DM 을 뺐으므로(NotifyService) 그쪽 소리가 더는
            // 울리지 않는다. 그 자리를 이것이 대신한다.
            //
            // **내가 보낸 것에는 울리지 않는다.** 이 이벤트는 내 대화 목록이
            // 바뀔 때마다 오므로 내가 보낸 순간에도 온다. 마지막 글의 작성자로
            // 가른다.
            if (conversation?.last_status?.account?.id !== me) {
              dispatch(dmMessageReceived());
            }
          }

          break;
        }
        case 'announcement':
          // @ts-expect-error
          dispatch(updateAnnouncements(JSON.parse(data.payload)));
          break;
        case 'announcement.reaction':
          // @ts-expect-error
          dispatch(updateAnnouncementsReaction(JSON.parse(data.payload)));
          break;
        case 'announcement.delete':
          dispatch(deleteAnnouncement(data.payload));
          break;
        }
      },
    };
  });
};

/**
 * @param {Function} dispatch
 */
async function refreshHomeTimelineAndNotification(dispatch) {
  await dispatch(expandHomeTimeline({ maxId: undefined }));

  // TODO: polling for merged notifications
  try {
    await dispatch(pollRecentGroupNotifications());
  } catch {
    // TODO
  }

  await dispatch(fetchAnnouncements());
}

/**
 * @type {Set<Function>}
 */
const managedConnections = new Set();

/**
 * @returns {(dispatch: Function, getState: Function) => () => void}
 */
export const connectUserStream = () => (dispatch, getState) => {
  const disconnect = dispatch(
    connectTimelineStream('home', 'user', {}, { fallback: refreshHomeTimelineAndNotification, fillGaps: fillHomeTimelineGaps }),
  );

  if (typeof disconnect === 'function') {
    managedConnections.add(disconnect);
  }

  return () => {
    if (typeof disconnect === 'function') {
      managedConnections.delete(disconnect);
      disconnect();
    }
  };
};

// 퍼블릭 툿에 들어갈 툿인지 판정한다.
//
// 서버의 PublicFeed#standard_public_scope 와 규칙이 같아야 한다. 어긋나면
// 실시간으로 뜬 툿이 새로고침하면 사라지거나 그 반대가 된다. 한쪽을 고치면
// 반드시 다른 쪽도 같이 고칠 것.
/**
 * @param {import('../api_types/statuses').ApiStatusJSON} status
 * @param {Object} options
 * @param {boolean} [options.onlyMedia]
 * @returns {boolean}
 */
const acceptsIntoPublicTootTimeline = (status, { onlyMedia }) => {
  // 재게시는 넣는다 — 이 타임라인은 with_reblogs: true 로 돈다
  // (Api::V1::Timelines::PublicController). user 채널로 온 재게시는 서버에서 이미
  // 겹팔로워 교집합을 통과한 것이라 여기서 팔로우 관계를 다시 볼 필요가 없다.
  //
  // 멘션은 감싸는 쪽과 원본을 모두 본다 — PublicFeed 의 WITHOUT_MENTIONS_SQL 이
  // statuses.id 와 statuses.reblog_of_id 둘 다 검사하는 것과 같다.
  if (status.mentions?.length) return false;
  if (status.reblog?.mentions?.length) return false;

  // 답글 판정은 감싸는 쪽 기준 (Status.without_replies 와 같다). 자기 스레드는 남긴다.
  if (status.in_reply_to_id && status.in_reply_to_account_id !== status.account?.id) return false;

  // media_only_scope 는 감싸는 행에 첨부가 붙어 있는지 본다. 재게시 껍데기는 첨부가
  // 없으므로 서버에서도 걸러진다 — 같은 기준을 쓰려면 원본이 아니라 껍데기를 봐야 한다.
  if (onlyMedia && !status.media_attachments?.length) return false;

  return true;
};

// 퍼블릭 툿 실시간 갱신.
//
// `public` / `public:local` 채널로는 아무것도 오지 않는다 — 모든 툿이 private 이고
// FanOutOnWriteService#broadcastable? 는 public_visibility? 를 요구하기 때문이다.
// 그래서 홈과 같은 `user` 채널을 듣고 위 기준으로 걸러낸다. 두 피드의 모집단이
// "내가 팔로우한 사람 + 나 + 공지 계정"으로 같아서 성립한다.
//
// 홈 스트림과 채널이 겹친다. stream.js 가 구독을 참조 카운트로 관리하므로 두 번
// 구독하는 것 자체는 안전하지만, 두 구독 모두 onReceive 를 받으므로 updatesOnly 로
// 채널 전역 이벤트(알림·대화·공지)를 넘겨야 한다. 안 그러면 이 칼럼이 열려 있는 동안
// 알림이 두 번씩 뜬다. 그쪽은 홈 구독(mastodon.jsx)이 이미 처리한다.
/**
 * @param {string} timelineId
 * @param {Object} options
 * @param {boolean} [options.onlyMedia]
 * @param {function(): object} options.fillGaps
 * @returns {function(): void}
 */
const connectPublicTootStream = (timelineId, { onlyMedia, fillGaps }) =>
  connectTimelineStream(timelineId, 'user', {}, {
    fillGaps,
    updatesOnly: true,
    accept: status => acceptsIntoPublicTootTimeline(status, { onlyMedia }),
  });

/**
 * @param {Object} options
 * @param {boolean} [options.onlyMedia]
 * @returns {function(): void}
 */
export const connectCommunityStream = ({ onlyMedia } = {}) =>
  connectPublicTootStream(`community${onlyMedia ? ':media' : ''}`, {
    onlyMedia,
    fillGaps: () => fillCommunityTimelineGaps({ onlyMedia }),
  });

/**
 * @param {Object} options
 * @param {boolean} [options.onlyMedia]
 * @param {boolean} [options.onlyRemote]
 * @returns {function(): void}
 */
export const connectPublicStream = ({ onlyMedia, onlyRemote } = {}) => {
  const timelineId = `public${onlyRemote ? ':remote' : ''}${onlyMedia ? ':media' : ''}`;

  // 원격 전용 칼럼은 연합을 안 하는 이 인스턴스에서 언제나 비어 있다. user 채널을
  // 물리면 로컬 툿이 원격 칼럼에 잘못 쌓이므로 원래 채널에 그대로 둔다.
  if (onlyRemote) {
    return connectTimelineStream(timelineId, timelineId, {}, { fillGaps: () => fillPublicTimelineGaps({ onlyMedia, onlyRemote }) });
  }

  return connectPublicTootStream(timelineId, {
    onlyMedia,
    fillGaps: () => fillPublicTimelineGaps({ onlyMedia }),
  });
};

/**
 * @param {string} columnId
 * @param {string} tagName
 * @param {boolean} onlyLocal
 * @param {function(object): boolean} accept
 * @returns {function(): void}
 */
export const connectHashtagStream = (columnId, tagName, onlyLocal, accept) =>
  connectTimelineStream(`hashtag:${columnId}${onlyLocal ? ':local' : ''}`, `hashtag${onlyLocal ? ':local' : ''}`, { tag: tagName }, { accept });

/**
 * @returns {function(): void}
 */
export const connectDirectStream = () =>
  connectTimelineStream('direct', 'direct');

// ─── @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅 실시간 수신 ───
//   근거: dm-chat-phase-3.md §1
//
//   기존 connectDirectStream 과 **같은 채널**(timeline:direct:<계정id>)을 듣지만
//   timelineId 를 주지 않는다. 이 화면은 timelines 리듀서가 아니라 방별
//   dm_messages 를 쓰기 때문이다. stream.js 가 구독을 목록으로 관리하므로 두
//   화면이 같은 채널을 동시에 들어도 연결은 하나다.
//
//   update 이벤트에는 status 전체가 실려 오지만 **어느 방인지 알 수 없어** 쓰지
//   않는다. 도착했다는 사실만 받아 열린 방을 since_id 로 다시 읽는다 (C 안 §1.2).
/**
 * @returns {function(): void}
 */
export const connectDmChatStream = () =>
  connectStream('direct', {}, (dispatch) => ({
    onConnect() {
      dispatch(setDmStreamConnected({ connected: true }));

      // 끊겨 있는 동안 온 메시지는 이벤트로 오지 않는다. 붙자마자 한 번 따라잡는다.
      dispatch(dmChatStreamUpdate());
    },

    onDisconnect() {
      // 끊긴 것을 알리지 않으면 화면이 조용히 낡는다. 사용자는 상대가 답이
      // 없다고 읽는다.
      dispatch(setDmStreamConnected({ connected: false }));
    },

    onReceive(data) {
      switch (data.event) {
      case 'update':
        dispatch(dmChatStreamUpdate());
        break;
      case 'status.update':
        // @ts-expect-error
        dispatch(updateStatus(JSON.parse(data.payload)));
        break;
      case 'delete':
        // 상대가 지운 메시지. 이것이 없으면 그 메시지에 답장을 걸어둔 사이에
        // 상대가 지웠을 때 전송이 계속 404 로 실패한다.
        dispatch(deleteFromTimelines(data.payload));
        break;
      case 'conversation':
        // 기존 /conversations 화면의 상태도 같이 맞춰 둔다. 이 화면에 있는 동안
        // 그쪽 구독은 없다.
        // @ts-expect-error
        dispatch(updateConversations(JSON.parse(data.payload)));

        // @_longwhile — **여기서도 방을 다시 읽는다.**
        //
        //   `direct` 채널에 `update` 는 발행되지 않는다. 그 채널로 오는 것은
        //   `conversation`(PushConversationWorker)과 `delete` 뿐이다. 위의
        //   `case 'update'` 는 그래서 사실상 걸리지 않고, 새 메시지가 와도 방이
        //   갱신되지 않아 **새로고침해야 보였다.**
        //
        //   user 스트림 쪽에도 같은 호출이 있지만 그쪽만 믿지 않는다 — 두 스트림이
        //   같은 400ms 타이머를 공유하므로 겹쳐도 왕복은 한 번이다.
        dispatch(dmChatStreamUpdate());
        break;
      case 'dm.read': {
        // 상대가 읽었다. (FR-18, docs/dm-chat/phases/dm-chat-phase-4.md §3.2)
        //
        // **dmChatStreamUpdate() 를 부르지 않는다.** 읽음은 목록의 정렬·미리보기·
        // 안 읽은 개수를 바꾸지 않는다. 여기서 목록을 다시 읽으면 상대가 스크롤할
        // 때마다 방 목록 전체를 가져온다.
        //
        // 서버는 걸러서 보낸다 — 상호주의로 막힌 상대에게는 발행 자체가 없다.
        // 그래도 화면에서 한 번 더 거르지는 않는다. 서버 판정이 정본이다.
        // 이 파일의 다른 이벤트와 같다. data.payload 의 타입이 object 로 선언돼
        // 있어 JSON.parse 에 넘길 수 없다 — 실제로는 문자열이다.
        // @ts-expect-error
        const read = JSON.parse(data.payload);

        dispatch(updateDmReadState({
          roomId: read.dm_room_id,
          accountId: read.account_id,
          lastReadStatusId: read.last_read_status_id,
        }));
        break;
      }
      }
    },
  }));

/**
 * @param {string} listId
 * @returns {function(): void}
 */
export const connectListStream = listId =>
  connectTimelineStream(`list:${listId}`, 'list', { list: listId }, { fillGaps: () => fillListTimelineGaps(listId) });

/**
 * @returns {void}
 */
/**
 * @returns {(dispatch: Function) => void}
 */
export const streamingDisconnectAll = () => () => {
  Array.from(managedConnections).forEach((disconnect) => {
    try {
      disconnect();
    } catch (error) {
      console.error('Failed to disconnect stream:', error);
    }
    managedConnections.delete(disconnect);
  });
};

/**
 * @returns {function(): void}
 */
/**
 * @returns {(dispatch: Function, getState: Function) => () => void}
 */
export const streamingConnectAll = () => (dispatch, getState) => {
  dispatch(streamingDisconnectAll());
  return dispatch(connectUserStream());
};
