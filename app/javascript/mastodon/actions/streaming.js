// @ts-check

import { getLocale } from '../locales';
import { connectStream } from '../stream';

import {
  fetchAnnouncements,
  updateAnnouncements,
  updateReaction as updateAnnouncementsReaction,
  deleteAnnouncement,
} from './announcements';
import { updateConversations } from './conversations';
import { dmChatStreamUpdate, setDmStreamConnected, updateDmReadState } from './dm_rooms';
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
          dispatch(updateNotifications(notificationJSON, messages, locale));
          // TODO: remove this once the groups feature replaces the previous one
          dispatch(processNewNotificationForGroups(notificationJSON));
          break;
        }
        case 'notifications_merged': {
          dispatch(refreshStaleNotificationGroups());
          break;
        }
        case 'conversation':
          // @ts-expect-error
          dispatch(updateConversations(JSON.parse(data.payload)));
          break;
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

/**
 * @param {object} status
 * @param {Object} options
 * @param {boolean} [options.onlyMedia]
 * @returns {boolean}
 */
const acceptsIntoPublicTootTimeline = (status, { onlyMedia }) => {
  if (status.mentions?.length) return false;
  if (status.reblog?.mentions?.length) return false;

  if (status.in_reply_to_id && status.in_reply_to_account_id !== status.account?.id) return false;

  if (onlyMedia && !status.media_attachments?.length) return false;

  return true;
};

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

// ─── @_longwhile custom feature
/**
 * @returns {function(): void}
 */
export const connectDmChatStream = () =>
  connectStream('direct', {}, (dispatch) => ({
    onConnect() {
      dispatch(setDmStreamConnected({ connected: true }));

      dispatch(dmChatStreamUpdate());
    },

    onDisconnect() {
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
        dispatch(deleteFromTimelines(data.payload));
        break;
      case 'conversation':
        // @ts-expect-error
        dispatch(updateConversations(JSON.parse(data.payload)));
        break;
      case 'dm.read': {
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
