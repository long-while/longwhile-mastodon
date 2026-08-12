import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';

import { useDispatch, useSelector } from 'react-redux';

import CalendarClockIcon from '@/styles/bird-theme-svg/calendar-clock.svg?react';
import { openModal } from 'mastodon/actions/modal';
import {
  deleteScheduledStatus,
  expandScheduledStatuses,
  fetchScheduledStatuses,
  verifyScheduledStatus,
} from 'mastodon/actions/scheduled_statuses';
import { CheckBox } from 'mastodon/components/check_box';
import { Column } from 'mastodon/components/column';
import { ColumnHeader } from 'mastodon/components/column_header';
import ScrollableList from 'mastodon/components/scrollable_list';
import { serverNow } from 'mastodon/utils/server_clock';

import { ScheduledStatusItem } from './components/scheduled_status_item';

const messages = defineMessages({
  title: { id: 'column.scheduled_statuses', defaultMessage: 'Scheduled posts' },
  confirmDeleteMultipleTitle: { id: 'scheduled_statuses.confirm_delete_multiple.title', defaultMessage: 'Delete scheduled posts?' },
  confirmDeleteMultipleMessage: { id: 'scheduled_statuses.confirm_delete_multiple.message', defaultMessage: 'You are about to discard {count, plural, one {one scheduled post} other {# scheduled posts}}. They will never be published.' },
  confirmDeleteMultipleButton: { id: 'scheduled_statuses.confirm_delete_multiple.button', defaultMessage: '{count, plural, one {Delete post} other {Delete posts}}' },
});

// How often the list re-evaluates which posts have come due.
const TICK_MS = 15_000;

// A due post normally publishes within seconds. Past this, something is wrong
// with the worker rather than with the post, so stop polling and say so — the
// user can re-trigger it themselves by changing the time.
const STALLED_AFTER_MS = 5 * 60 * 1000;

/** Local calendar day key, so grouping follows the viewer's time zone. */
const dayKey = (isoString) => {
  const date = new Date(isoString);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

// A component rather than a bare div: ScrollableList clones every child with
// scroll bookkeeping props, which React would reject on a DOM element.
const DaySeparator = ({ label, count }) => (
  <div className='scheduled-statuses__day'>
    <span className='scheduled-statuses__day__date'>{label}</span>
    <span className='scheduled-statuses__day__count'>
      {'· '}
      <FormattedMessage
        id='scheduled_statuses.day_count'
        defaultMessage='{count, plural, one {# post} other {# posts}}'
        values={{ count }}
      />
    </span>
  </div>
);

DaySeparator.propTypes = {
  label: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
};

const ScheduledStatuses = ({ multiColumn }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const columnRef = useRef();

  const items = useSelector(state => state.getIn(['scheduled_statuses', 'items']));
  const isLoading = useSelector(state => state.getIn(['scheduled_statuses', 'isLoading']));
  const hasMore = useSelector(state => !!state.getIn(['scheduled_statuses', 'next']));
  const usage = useSelector(state => state.getIn(['scheduled_statuses', 'usage']));
  const editingId = useSelector(state => state.getIn(['compose', 'scheduled_status_id']));

  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState([]);
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    // Always refetch on entry: another tab or client may have changed things.
    dispatch(fetchScheduledStatuses());
  }, [dispatch]);

  // Posts publish while this tab is in the background, so catch up on return
  // rather than polling continuously.
  useEffect(() => {
    const handleFocus = () => dispatch(fetchScheduledStatuses());

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [dispatch]);

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { dueIds, stalledIds } = useMemo(() => {
    const due = new Set();
    const stalled = new Set();

    items.forEach(item => {
      if (item.get('failed_at')) return;

      const overdueBy = now - Date.parse(item.get('scheduled_at'));

      if (overdueBy < 0) return;

      if (overdueBy >= STALLED_AFTER_MS) {
        stalled.add(item.get('id'));
      } else {
        due.add(item.get('id'));
      }
    });

    return { dueIds: due, stalledIds: stalled };
  }, [items, now]);

  // While something is mid-publication, check just those records so the row
  // disappears (or turns into a failure) on its own instead of going stale.
  //
  // Depends on a joined key rather than the Set itself: a Set is a fresh object
  // after every store update, which would make this effect retrigger its own
  // requests without end. Keyed this way it runs once per TICK_MS and stops as
  // soon as nothing is due.
  const dueKey = useMemo(() => [...dueIds].sort().join(','), [dueIds]);

  useEffect(() => {
    if (!dueKey) {
      return;
    }

    dueKey.split(',').forEach(id => {
      dispatch(verifyScheduledStatus(id));
    });
  }, [dueKey, now, dispatch]);

  // Drop selections whose records are gone (published or deleted meanwhile).
  useEffect(() => {
    setCheckedIds(ids => {
      const next = ids.filter(id => items.some(item => item.get('id') === id));
      return next.length === ids.length ? ids : next;
    });
  }, [items]);

  const handleHeaderClick = useCallback(() => {
    columnRef.current?.scrollTop();
  }, []);

  const handleLoadMore = useCallback(() => {
    dispatch(expandScheduledStatuses());
  }, [dispatch]);

  const handleToggleCheck = useCallback(id => {
    setCheckedIds(ids => ids.includes(id) ? ids.filter(existing => existing !== id) : [...ids, id]);
  }, []);

  const handleToggleSelectionMode = useCallback(() => {
    setSelectionMode(mode => {
      if (mode) setCheckedIds([]);
      return !mode;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setCheckedIds(ids => ids.length === items.size ? [] : items.map(item => item.get('id')).toArray());
  }, [items]);

  const handleDeleteSelected = useCallback(() => {
    const ids = checkedIds;

    dispatch(openModal({
      modalType: 'CONFIRM',
      modalProps: {
        title: intl.formatMessage(messages.confirmDeleteMultipleTitle),
        message: intl.formatMessage(messages.confirmDeleteMultipleMessage, { count: ids.length }),
        confirm: intl.formatMessage(messages.confirmDeleteMultipleButton, { count: ids.length }),
        onConfirm: () => {
          ids.forEach(id => {
            dispatch(deleteScheduledStatus(id)).catch(() => {});
          });
          setCheckedIds([]);
          setSelectionMode(false);
        },
      },
    }));
  }, [dispatch, intl, checkedIds]);

  // Flatten into rows so day separators and posts share one scroll container.
  const rows = useMemo(() => {
    const perDay = new Map();
    items.forEach(item => {
      const key = dayKey(item.get('scheduled_at'));
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    });

    const result = [];
    let previousKey = null;

    items.forEach(item => {
      const scheduledAt = item.get('scheduled_at');
      const key = dayKey(scheduledAt);

      if (key !== previousKey) {
        previousKey = key;
        result.push(
          <DaySeparator
            key={`day-${key}`}
            label={intl.formatDate(new Date(scheduledAt), { month: 'long', day: 'numeric', weekday: 'short' })}
            count={perDay.get(key)}
          />,
        );
      }

      result.push(
        <ScheduledStatusItem
          key={item.get('id')}
          scheduledStatus={item}
          showCheckbox={selectionMode}
          checked={checkedIds.includes(item.get('id'))}
          onToggleCheck={handleToggleCheck}
          isDue={dueIds.has(item.get('id'))}
          isStalled={stalledIds.has(item.get('id'))}
          isEditing={editingId === item.get('id')}
        />,
      );
    });

    return result;
  }, [items, intl, selectionMode, checkedIds, handleToggleCheck, dueIds, stalledIds, editingId]);

  const selectedCount = checkedIds.length;
  const allSelected = items.size > 0 && selectedCount === items.size;

  // Lives in the column header rather than the scroll area so the bulk actions
  // stay reachable while scrolling a long queue.
  const headerContent = (
    <div className='scheduled-statuses__summary'>
      {selectionMode && (
        <div className='scheduled-statuses__summary__checkbox'>
          <CheckBox
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            onChange={handleToggleSelectAll}
          />
        </div>
      )}

      <span>
        <FormattedMessage
          id='scheduled_statuses.usage'
          defaultMessage='{total} of {limit} scheduled'
          values={{ total: usage.get('total'), limit: usage.get('total_limit') }}
        />
      </span>

      {usage.get('failed') > 0 && (
        <span className='scheduled-statuses__summary__failed'>
          <FormattedMessage
            id='scheduled_statuses.usage_failed'
            defaultMessage='{count, plural, one {# failed} other {# failed}}'
            values={{ count: usage.get('failed') }}
          />
        </span>
      )}

      <span className='spacer' />

      {selectionMode && selectedCount > 0 && (
        <button type='button' className='link-button' onClick={handleDeleteSelected}>
          <FormattedMessage
            id='scheduled_statuses.delete_selected'
            defaultMessage='Delete {count, plural, one {# post} other {# posts}}'
            values={{ count: selectedCount }}
          />
        </button>
      )}

      {items.size > 0 && (
        <button type='button' className='text-btn' onClick={handleToggleSelectionMode}>
          {selectionMode ? (
            <FormattedMessage id='scheduled_statuses.exit_selection' defaultMessage='Done' />
          ) : (
            <FormattedMessage id='scheduled_statuses.edit_selection' defaultMessage='Select' />
          )}
        </button>
      )}
    </div>
  );

  return (
    <Column bindToDocument={!multiColumn} ref={columnRef} label={intl.formatMessage(messages.title)}>
      <ColumnHeader
        icon='clock-o'
        iconComponent={CalendarClockIcon}
        title={intl.formatMessage(messages.title)}
        onClick={handleHeaderClick}
        multiColumn={multiColumn}
        appendContent={headerContent}
      />

      <ScrollableList
        scrollKey='scheduled_statuses'
        trackScroll={!multiColumn}
        bindToDocument={!multiColumn}
        isLoading={isLoading}
        showLoading={isLoading && items.size === 0}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        emptyMessage={<FormattedMessage id='empty_column.scheduled_statuses' defaultMessage='You have no scheduled posts. Use the clock button in the composer to schedule one.' />}
      >
        {rows}
      </ScrollableList>

      <Helmet>
        <title>{intl.formatMessage(messages.title)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

ScheduledStatuses.propTypes = {
  multiColumn: PropTypes.bool,
};

// eslint-disable-next-line import/no-default-export
export default ScheduledStatuses;
