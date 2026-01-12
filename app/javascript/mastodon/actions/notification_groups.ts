import { createAction } from '@reduxjs/toolkit';

import {
  apiClearNotifications,
  apiFetchNotificationGroups,
} from 'mastodon/api/notifications';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type {
  ApiNotificationGroupJSON,
  ApiNotificationJSON,
  NotificationType,
} from 'mastodon/api_types/notifications';
import { allNotificationTypes } from 'mastodon/api_types/notifications';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';
import { usePendingItems } from 'mastodon/initial_state';
import type { NotificationGap } from 'mastodon/reducers/notification_groups';
import {
  selectSettingsNotificationsExcludedTypes,
  selectSettingsNotificationsGroupFollows,
  selectSettingsNotificationsQuickFilterActive,
  selectSettingsNotificationsShows,
} from 'mastodon/selectors/settings';
import type { AppDispatch, RootState } from 'mastodon/store';
import {
  createAppAsyncThunk,
  createDataLoadingThunk,
} from 'mastodon/store/typed_functions';

import { importFetchedAccounts, importFetchedStatuses } from './importer';
import { NOTIFICATIONS_FILTER_SET } from './notifications';
import { saveSettings } from './settings';

// --- 기존 함수 유지 ---
function dispatchAssociatedRecords(
  dispatch: AppDispatch,
  notifications: ApiNotificationGroupJSON[] | ApiNotificationJSON[],
) {
  const fetchedAccounts: ApiAccountJSON[] = [];
  const fetchedStatuses: ApiStatusJSON[] = [];

  notifications.forEach((notification) => {
    if (notification.type === 'admin.report') {
      fetchedAccounts.push(notification.report.target_account);
    }

    if (notification.type === 'moderation_warning') {
      fetchedAccounts.push(notification.moderation_warning.target_account);
    }

    if ('status' in notification && notification.status) {
      fetchedStatuses.push(notification.status);
    }
  });

  if (fetchedAccounts.length > 0)
    dispatch(importFetchedAccounts(fetchedAccounts));

  if (fetchedStatuses.length > 0)
    dispatch(importFetchedStatuses(fetchedStatuses));
}

function selectNotificationGroupedTypes(state: RootState) {
  const types: NotificationType[] = ['favourite', 'reblog'];

  if (selectSettingsNotificationsGroupFollows(state)) types.push('follow');

  return types;
}

// --- mention 제외 절대 금지 & fetch 단계 필터링 ---
function getExcludedTypes(state: RootState) {
  const activeFilter = selectSettingsNotificationsQuickFilterActive(state);

  // 기존 제외 타입에서 mention 제거
  const baseExcluded = selectSettingsNotificationsExcludedTypes(state).filter(
    (type) => type !== 'mention',
  );

  if (activeFilter === 'all') return baseExcluded;

  // DM, Mentions, 일반 탭 모두 mention 제외하지 않음
  return allNotificationTypes.filter(
    (type) => type !== 'mention' && type !== activeFilter,
  );
}

// --- visibility 가져오기 헬퍼 함수 (백엔드 수정 전후 호환성) ---
function getNotificationVisibility(notification: ApiNotificationGroupJSON | ApiNotificationJSON): string | undefined {
  // 백엔드에서 status_visibility를 제공하면 우선 사용
  if ('status_visibility' in notification && notification.status_visibility) {
    return notification.status_visibility;
  }
  // fallback: 기존 status.visibility 사용
  if ('status' in notification && notification.status?.visibility) {
    return notification.status.visibility;
  }
  return undefined;
}

// --- fetchNotifications 수정 ---
export const fetchNotifications = createDataLoadingThunk(
  'notificationGroups/fetch',
  async (_params, { getState }) => {
    const state = getState();
    const groupedTypes = selectNotificationGroupedTypes(state);
    const excludeTypes = getExcludedTypes(state);
    const activeFilter = selectSettingsNotificationsQuickFilterActive(state);

    const allNotifications = await apiFetchNotificationGroups({
      grouped_types: groupedTypes,
      exclude_types: excludeTypes,
    });

    // fetch 후 visibility 기준 필터링
    const filteredNotifications = allNotifications.notifications.filter((n) => {
      if (n.type !== 'mention') {
        return true;
      }

      const visibility = getNotificationVisibility(n);

      if (activeFilter === 'noti_dm') {
        return visibility === 'direct';
      }

      if (activeFilter === 'noti_mention') {
        return visibility !== 'direct';
      }

      return true; // all 또는 일반 탭
    });

    return {
      ...allNotifications,
      notifications: filteredNotifications,
    };
  },
  ({ notifications, accounts, statuses }, { dispatch }) => {
    dispatch(importFetchedAccounts(accounts));
    dispatch(importFetchedStatuses(statuses));
    dispatchAssociatedRecords(dispatch, notifications);

    const payload: (ApiNotificationGroupJSON | NotificationGap)[] = notifications;

    if (notifications.length > 1)
      payload.push({ type: 'gap', maxId: notifications.at(-1)?.page_min_id });

    return payload;
  },
);

export const fetchNotificationsGap = createDataLoadingThunk(
  'notificationGroups/fetchGap',
  async (params: { gap: NotificationGap }, { getState }) =>
    apiFetchNotificationGroups({
      grouped_types: selectNotificationGroupedTypes(getState()),
      max_id: params.gap.maxId,
      exclude_types: getExcludedTypes(getState()),
    }),
  ({ notifications, accounts, statuses }, { dispatch }) => {
    dispatch(importFetchedAccounts(accounts));
    dispatch(importFetchedStatuses(statuses));
    dispatchAssociatedRecords(dispatch, notifications);

    return { notifications };
  },
);

export const pollRecentNotifications = createDataLoadingThunk(
  'notificationGroups/pollRecentNotifications',
  async (_params, { getState }) => {
    const state = getState();
    const groupedTypes = selectNotificationGroupedTypes(state);
    const excludeTypes = getExcludedTypes(state);

    const allNotifications = await apiFetchNotificationGroups({
      grouped_types: groupedTypes,
      exclude_types: excludeTypes,
      max_id: undefined,
      since_id: usePendingItems
        ? state.notificationGroups.groups.find((g) => g.type !== 'gap')?.page_max_id
        : undefined,
    });

    // fetch 후 visibility 기준 필터링
    const activeFilter = selectSettingsNotificationsQuickFilterActive(state);
    const filteredNotifications = allNotifications.notifications.filter((n) => {
      if (n.type !== 'mention') return true;
      const visibility = getNotificationVisibility(n);
      if (activeFilter === 'noti_dm') return visibility === 'direct';
      if (activeFilter === 'noti_mention') return visibility !== 'direct';
      return true;
    });

    return {
      ...allNotifications,
      notifications: filteredNotifications,
    };
  },
  ({ notifications, accounts, statuses }, { dispatch }) => {
    dispatch(importFetchedAccounts(accounts));
    dispatch(importFetchedStatuses(statuses));
    dispatchAssociatedRecords(dispatch, notifications);

    return { notifications };
  },
  { useLoadingBar: false },
);

export const processNewNotificationForGroups = createAppAsyncThunk(
  'notificationGroups/processNew',
  (notification: ApiNotificationJSON, { dispatch, getState }) => {
    const state = getState();
    const activeFilter = selectSettingsNotificationsQuickFilterActive(state);
    const notificationShows = selectSettingsNotificationsShows(state);

    const showInColumn = (() => {
      if (activeFilter === 'all') {
        return notificationShows[notification.type] !== false;
      }

      if (activeFilter === 'noti_dm') {
        const visibility = getNotificationVisibility(notification);
        return notification.type === 'mention' && visibility === 'direct';
      }

      if (activeFilter === 'noti_mention') {
        const visibility = getNotificationVisibility(notification);
        return notification.type === 'mention' && visibility !== 'direct';
      }

      return activeFilter === notification.type;
    })();

    if (!showInColumn) return;

    if ((notification.type === 'mention' || notification.type === 'update') && notification.status?.filtered) {
      const filters = notification.status.filtered.filter((result) =>
        result.filter.context.includes('notifications'),
      );

      if (filters.some((result) => result.filter.filter_action === 'hide')) return;
    }

    dispatchAssociatedRecords(dispatch, [notification]);

    return {
      notification,
      groupedTypes: selectNotificationGroupedTypes(state),
    };
  },
);

export const loadPending = createAction('notificationGroups/loadPending');

export const updateScrollPosition = createAppAsyncThunk(
  'notificationGroups/updateScrollPosition',
  ({ top }: { top: boolean }, { dispatch, getState }) => {
    if (top && getState().notificationGroups.mergedNotifications === 'needs-reload') {
      void dispatch(fetchNotifications());
    }
    return { top };
  },
);

export const setNotificationsFilter = createAppAsyncThunk(
  'notifications/filter/set',
  ({ filterType }: { filterType: string }, { dispatch }) => {
    dispatch({
      type: NOTIFICATIONS_FILTER_SET,
      path: ['notifications', 'quickFilter', 'active'],
      value: filterType,
    });
    void dispatch(fetchNotifications());
    dispatch(saveSettings());
  },
);

export const clearNotifications = createDataLoadingThunk(
  'notifications/clear',
  () => apiClearNotifications(),
);

export const markNotificationsAsRead = createAction('notificationGroups/markAsRead');

export const mountNotifications = createAppAsyncThunk(
  'notificationGroups/mount',
  (_, { dispatch, getState }) => {
    const state = getState();
    if (state.notificationGroups.mounted === 0 && state.notificationGroups.mergedNotifications === 'needs-reload') {
      void dispatch(fetchNotifications());
    }
  },
);

export const unmountNotifications = createAction('notificationGroups/unmount');

export const refreshStaleNotificationGroups = createAppAsyncThunk<{
  deferredRefresh: boolean;
}>('notificationGroups/refreshStale', (_, { dispatch, getState }) => {
  const state = getState();
  if (state.notificationGroups.scrolledToTop || !state.notificationGroups.mounted) {
    void dispatch(fetchNotifications());
    return { deferredRefresh: false };
  }
  return { deferredRefresh: true };
});