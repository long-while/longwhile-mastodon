import { useCallback, useEffect, useMemo, useRef } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Helmet } from 'react-helmet';

import { isEqual } from 'lodash';
import { useDebouncedCallback } from 'use-debounce';

import MessagesIcon from '@/styles/bird-theme-svg/messages-fill.svg?react';
import {
  fetchNotificationsGap,
  loadPending,
  mountNotifications,
  setNotificationsFilter,
  unmountNotifications,
  updateScrollPosition,
} from 'mastodon/actions/notification_groups';
import { compareId } from 'mastodon/compare_id';
import { Column } from 'mastodon/components/column';
import type { ColumnRef } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import { LoadGap } from 'mastodon/components/load_gap';
import { NotSignedInIndicator } from 'mastodon/components/not_signed_in_indicator';
import ScrollableList from 'mastodon/components/scrollable_list';
import { NotificationGroup } from 'mastodon/features/notifications_v2/components/notification_group';
import { useIdentity } from 'mastodon/identity_context';
import type { NotificationGap } from 'mastodon/reducers/notification_groups';
import {
  selectPendingMentionGroups,
  selectPendingNotificationGroupsCount,
} from 'mastodon/selectors/notifications';
import {
  selectSettingsNotificationsQuickFilterActive,
  selectSettingsNotificationsShowUnread,
} from 'mastodon/selectors/settings';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  title: { id: 'column.pending-mentions', defaultMessage: 'Awaiting reply' },
});

const PendingMentions: React.FC<{
  columnId?: string;
  multiColumn?: boolean;
}> = ({ columnId, multiColumn }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(selectPendingMentionGroups, isEqual);
  const isLoading = useAppSelector((s) => s.notificationGroups.isLoading);
  const numPending = useAppSelector(selectPendingNotificationGroupsCount);
  const lastReadId = useAppSelector((s) =>
    selectSettingsNotificationsShowUnread(s)
      ? s.notificationGroups.readMarkerId
      : '0',
  );
  const activeFilter = useAppSelector(
    selectSettingsNotificationsQuickFilterActive,
  );

  const columnRef = useRef<ColumnRef>(null);
  const { signedIn } = useIdentity();

  useEffect(() => {
    void dispatch(mountNotifications());

    if (activeFilter !== 'noti_pending') {
      void dispatch(setNotificationsFilter({ filterType: 'noti_pending' }));
    }

    return () => {
      dispatch(unmountNotifications());
      void dispatch(updateScrollPosition({ top: false }));
    };
  }, [dispatch, activeFilter]);

  const hasMore = notifications.at(-1)?.type === 'gap';

  const handleLoadGap = useCallback(
    (gap: NotificationGap) => {
      void dispatch(fetchNotificationsGap({ gap }));
    },
    [dispatch],
  );

  const handleLoadOlder = useDebouncedCallback(
    () => {
      const gap = notifications.at(-1);
      if (gap?.type === 'gap') void dispatch(fetchNotificationsGap({ gap }));
    },
    300,
    { leading: true },
  );

  const handleLoadPending = useCallback(() => {
    dispatch(loadPending());
  }, [dispatch]);

  const handleScrollToTop = useDebouncedCallback(() => {
    void dispatch(updateScrollPosition({ top: true }));
  }, 100);

  const handleScroll = useDebouncedCallback(() => {
    void dispatch(updateScrollPosition({ top: false }));
  }, 100);

  useEffect(() => {
    return () => {
      handleLoadOlder.cancel();
      handleScrollToTop.cancel();
      handleScroll.cancel();
    };
  }, [handleLoadOlder, handleScrollToTop, handleScroll]);

  const handleHeaderClick = useCallback(() => {
    columnRef.current?.scrollTop();
  }, []);

  const selectChild = useCallback((index: number, alignTop: boolean) => {
    const container = columnRef.current?.node as HTMLElement | undefined;
    if (!container) return;

    const element = container.querySelector<HTMLElement>(
      `article:nth-of-type(${index + 1}) .focusable`,
    );

    if (element) {
      if (alignTop && container.scrollTop > element.offsetTop) {
        element.scrollIntoView(true);
      } else if (
        !alignTop &&
        container.scrollTop + container.clientHeight <
        element.offsetTop + element.offsetHeight
      ) {
        element.scrollIntoView(false);
      }
      element.focus();
    }
  }, []);

  const handleMoveUp = useCallback(
    (id: string) => {
      const elementIndex =
        notifications.findIndex(
          (item) => item.type !== 'gap' && item.group_key === id,
        ) - 1;
      selectChild(elementIndex, true);
    },
    [notifications, selectChild],
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      const elementIndex =
        notifications.findIndex(
          (item) => item.type !== 'gap' && item.group_key === id,
        ) + 1;
      selectChild(elementIndex, false);
    },
    [notifications, selectChild],
  );

  const pinned = !!columnId;

  const emptyMessage = (
    <FormattedMessage
      id='empty_column.pending-mentions'
      defaultMessage='No mentions awaiting your reply.'
    />
  );

  const prepend = (
    <div className='follow_requests-unlocked_explanation'>
      <span>
        <FormattedMessage
          id='pending-mentions.explanation'
          defaultMessage='Mentions that do not require a reply can be removed from this queue by favouriting them.'
        />
      </span>
    </div>
  );

  const scrollableContent = useMemo(() => {
    if (notifications.length === 0 && !hasMore) return null;

    return notifications.map((item) =>
      item.type === 'gap' ? (
        <LoadGap
          key={`${item.maxId}-${item.sinceId}`}
          disabled={isLoading}
          param={item}
          onClick={handleLoadGap}
        />
      ) : (
        <NotificationGroup
          key={item.group_key}
          notificationGroupId={item.group_key}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          unread={
            lastReadId !== '0' &&
            !!item.page_max_id &&
            compareId(item.page_max_id, lastReadId) > 0
          }
        />
      ),
    );
  }, [
    notifications,
    isLoading,
    hasMore,
    lastReadId,
    handleLoadGap,
    handleMoveUp,
    handleMoveDown,
  ]);

  const scrollContainer = signedIn ? (
    <ScrollableList
      scrollKey={`pending-mentions-${columnId ?? ''}`}
      trackScroll={!pinned}
      isLoading={isLoading}
      showLoading={isLoading && notifications.length === 0}
      hasMore={hasMore}
      numPending={numPending}
      prepend={prepend}
      alwaysPrepend
      emptyMessage={emptyMessage}
      onLoadMore={handleLoadOlder}
      onLoadPending={handleLoadPending}
      onScrollToTop={handleScrollToTop}
      onScroll={handleScroll}
      bindToDocument={!multiColumn}
    >
      {scrollableContent}
    </ScrollableList>
  ) : (
    <NotSignedInIndicator />
  );

  return (
    <Column
      bindToDocument={!multiColumn}
      ref={columnRef}
      label={intl.formatMessage(messages.title)}
    >
      <ColumnHeader
        icon='pending'
        iconComponent={MessagesIcon}
        title={intl.formatMessage(messages.title)}
        onClick={handleHeaderClick}
        multiColumn={multiColumn}
      />

      {scrollContainer}

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default PendingMentions;
