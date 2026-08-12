import { useCallback } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { useDispatch, useSelector } from 'react-redux';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { clearComposeSchedule, resetCompose } from 'mastodon/actions/compose';
import { openModal } from 'mastodon/actions/modal';
import { IconButton } from 'mastodon/components/icon_button';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import { browserHistory } from 'mastodon/components/router';
import { formatScheduledAtShort } from 'mastodon/utils/scheduled_at';

const messages = defineMessages({
  clear: { id: 'schedule_indicator.clear', defaultMessage: 'Remove schedule' },
  cancelEdit: { id: 'schedule_indicator.cancel_edit', defaultMessage: 'Cancel editing' },
  edit: { id: 'schedule_indicator.edit', defaultMessage: 'Change scheduled time' },
});

export const ScheduleIndicator = () => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const scheduledAt = useSelector(state => state.getIn(['compose', 'scheduled_at']));
  const scheduledStatusId = useSelector(state => state.getIn(['compose', 'scheduled_status_id']));
  const hasPoll = useSelector(state => state.getIn(['compose', 'poll']) !== null);
  const label = formatScheduledAtShort(intl, scheduledAt);

  const handleEditClick = useCallback(() => {
    dispatch(openModal({ modalType: 'SCHEDULE', modalProps: {} }));
  }, [dispatch]);

  // While editing an existing scheduled post there is no meaningful "post now"
  // state to fall back to, so the close button abandons the edit instead. The
  // record itself is untouched on the server, so nothing is actually lost.
  const handleCancelClick = useCallback(() => {
    if (!scheduledStatusId) {
      dispatch(clearComposeSchedule());
      return;
    }

    dispatch(resetCompose());

    // Return the user where they came from (usually the scheduled list) rather
    // than leaving them on an empty composer.
    if (browserHistory.location.pathname === '/publish' && window.history.state) {
      browserHistory.goBack();
    }
  }, [dispatch, scheduledStatusId]);

  if (!scheduledAt) {
    return null;
  }

  return (
    <div className='schedule-indicator'>
      <div className='schedule-indicator__row'>
        <button type='button' className='schedule-indicator__summary' onClick={handleEditClick} title={intl.formatMessage(messages.edit)}>
          <span className='schedule-indicator__summary__text'>
            <FormattedMessage
              id='schedule_indicator.will_send'
              defaultMessage='Scheduled for {datetime}'
              values={{ datetime: label }}
            />
          </span>

          <span className='schedule-indicator__summary__relative'>
            <RelativeTimestamp timestamp={scheduledAt} futureDate short={false} />
          </span>
        </button>

        <div className='schedule-indicator__cancel'>
          <IconButton
            title={intl.formatMessage(scheduledStatusId ? messages.cancelEdit : messages.clear)}
            icon='times'
            iconComponent={CloseIcon}
            onClick={handleCancelClick}
            inverted
          />
        </div>
      </div>

      {/* Shown here rather than only in the dialog, because a poll is usually
          added after the time has been picked. */}
      {hasPoll && (
        <p className='schedule-indicator__note'>
          <FormattedMessage
            id='schedule_indicator.poll_hint'
            defaultMessage='The poll starts counting down when the post is published, not now.'
          />
        </p>
      )}
    </div>
  );
};
