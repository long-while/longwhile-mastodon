import { createSelector } from '@reduxjs/toolkit';
import type { Map as ImmutableMap } from 'immutable';

import { compareId } from 'mastodon/compare_id';
import type { NotificationGroup } from 'mastodon/models/notification_group';
import type { NotificationGap } from 'mastodon/reducers/notification_groups';
import type { RootState } from 'mastodon/store';

import {
  selectSettingsNotificationsExcludedTypes,
  selectSettingsNotificationsQuickFilterActive,
  selectSettingsNotificationsQuickFilterShow,
} from './settings';

type StatusesMap = ImmutableMap<string, ImmutableMap<string, unknown>>;

// "답변 대기" 탭: 비공개 범위 멘션 + 아직 누구도 답글 안 단 것 + 내가 즐겨찾기 안 한 것.
// status가 아직 로드 안 된 경우엔 안전하게 표시 (놓치는 것보다 노출이 낫다).
const isAwaitingReply = (
  group: NotificationGroup,
  statuses: StatusesMap,
): boolean => {
  if (group.type !== 'mention') return false;
  if (group.visibility === 'public' || !group.visibility) return false;
  if (!group.statusId) return false;

  const status = statuses.get(group.statusId);
  if (!status) return true;

  if (status.get('favourited') === true) return false;
  const repliesCount = status.get('replies_count');
  if (typeof repliesCount === 'number' && repliesCount > 0) return false;

  return true;
};

/**
 * Filters notifications based on the active filter type.
 * Mentions and DMs ignore excludedTypes to always appear in their respective tabs.
 */
const filterNotificationsByAllowedTypes = (
  showFilterBar: boolean,
  allowedType: string,
  excludedTypes: string[],
  notifications: (NotificationGroup | NotificationGap)[],
  statuses: StatusesMap,
): (NotificationGroup | NotificationGap)[] => {
  // Always show all if no filter bar or "all" is selected
  if (!showFilterBar || allowedType === 'all') {
    return notifications.filter(
      (item) => item.type === 'gap' || !excludedTypes.includes(item.type),
    );
  }

  // Mentions tab: show mentions that are NOT direct (ignore excludedTypes)
  if (allowedType === 'noti_mention') {
    return notifications.filter(
      (g) => g.type === 'gap' || (g.type === 'mention' && g.visibility !== 'direct'),
    );
  }

  // DM tab: show mentions that ARE direct (ignore excludedTypes)
  if (allowedType === 'noti_dm') {
    return notifications.filter(
      (g) => g.type === 'gap' || (g.type === 'mention' && g.visibility === 'direct'),
    );
  }

  // Awaiting-reply tab: 비공개 범위 멘션, 아직 답글 0개, 내가 즐겨찾기 안 한 것
  if (allowedType === 'noti_pending') {
    return notifications.filter(
      (g) => g.type === 'gap' || isAwaitingReply(g, statuses),
    );
  }

  // Other types: apply excludedTypes normally
  return notifications.filter(
    (item) => item.type === 'gap' || (allowedType === item.type && !excludedTypes.includes(item.type)),
  );
};

const selectStatusesMap = (state: RootState) =>
  state.statuses as unknown as StatusesMap;

// 전용 페이지 (/pending-mentions) 용 selector. active filter와 무관하게 항상 noti_pending 조건 적용.
export const selectPendingMentionGroups = createSelector(
  [
    (state: RootState) =>
      state.notificationGroups.groups as (NotificationGroup | NotificationGap)[],
    selectStatusesMap,
  ],
  (notifications, statuses): (NotificationGroup | NotificationGap)[] =>
    notifications.filter(
      (g) => g.type === 'gap' || isAwaitingReply(g, statuses),
    ),
);

export const selectNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.groups,
    selectStatusesMap,
  ],
  filterNotificationsByAllowedTypes,
);

const selectPendingNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.pendingGroups,
    selectStatusesMap,
  ],
  filterNotificationsByAllowedTypes,
);

export const selectUnreadNotificationGroupsCount = createSelector(
  [
    (s: RootState) => s.notificationGroups.lastReadId,
    selectNotificationGroups,
    selectPendingNotificationGroups,
  ],
  (notificationMarker, groups, pendingGroups) => {
    return (
      groups.filter(
        (group) =>
          group.type !== 'gap' &&
          group.page_max_id &&
          compareId(group.page_max_id, notificationMarker) > 0,
      ).length +
      pendingGroups.filter(
        (group) =>
          group.type !== 'gap' &&
          group.page_max_id &&
          compareId(group.page_max_id, notificationMarker) > 0,
      ).length
    );
  },
);

export const selectAnyPendingNotification = createSelector(
  [
    (s: RootState) => s.notificationGroups.readMarkerId,
    selectNotificationGroups,
  ],
  (notificationMarker, groups) => {
    return groups.some(
      (group) =>
        group.type !== 'gap' &&
        group.page_max_id &&
        compareId(group.page_max_id, notificationMarker) > 0,
    );
  },
);

export const selectPendingNotificationGroupsCount = createSelector(
  [selectPendingNotificationGroups],
  (pendingGroups) =>
    pendingGroups.filter((group) => group.type !== 'gap').length,
);