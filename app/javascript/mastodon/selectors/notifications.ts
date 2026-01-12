import { createSelector } from '@reduxjs/toolkit';

import { compareId } from 'mastodon/compare_id';
import type { NotificationGroup } from 'mastodon/models/notification_group';
import type { NotificationGap } from 'mastodon/reducers/notification_groups';
import type { RootState } from 'mastodon/store';

import {
  selectSettingsNotificationsExcludedTypes,
  selectSettingsNotificationsQuickFilterActive,
  selectSettingsNotificationsQuickFilterShow,
} from './settings';

/**
 * Filters notifications based on the active filter type.
 * Mentions and DMs ignore excludedTypes to always appear in their respective tabs.
 */
const filterNotificationsByAllowedTypes = (
  showFilterBar: boolean,
  allowedType: string,
  excludedTypes: string[],
  notifications: (NotificationGroup | NotificationGap)[],
) => {
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

  // Other types: apply excludedTypes normally
  return notifications.filter(
    (item) => item.type === 'gap' || (allowedType === item.type && !excludedTypes.includes(item.type)),
  );
};

export const selectNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.groups,
  ],
  filterNotificationsByAllowedTypes,
);

const selectPendingNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.pendingGroups,
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