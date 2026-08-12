import PropTypes from 'prop-types';
import { useCallback, useMemo } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Map as ImmutableMap, List as ImmutableList } from 'immutable';
import ImmutablePropTypes from 'react-immutable-proptypes';

import { useDispatch } from 'react-redux';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import WarningIcon from '@/material-icons/400-24px/warning.svg?react';
import ClockFiveIcon from '@/styles/bird-theme-svg/clock-five.svg?react';
import { setComposeToScheduledStatus } from 'mastodon/actions/compose';
import { openModal } from 'mastodon/actions/modal';
import { deleteScheduledStatus, updateScheduledStatus } from 'mastodon/actions/scheduled_statuses';
import { CheckBox } from 'mastodon/components/check_box';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { Icon } from 'mastodon/components/icon';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import { VisibilityIcon } from 'mastodon/components/visibility_icon';
import { scheduledStatusMinimumOffset } from 'mastodon/initial_state';
import { earliestScheduledAt, formatScheduledAtLabel, toOffsetISOString } from 'mastodon/utils/scheduled_at';

const messages = defineMessages({
  more: { id: 'status.more', defaultMessage: 'More' },
  changeTime: { id: 'scheduled_statuses.change_time', defaultMessage: 'Change time' },
  editContent: { id: 'scheduled_statuses.edit_content', defaultMessage: 'Edit post' },
  publishNow: { id: 'scheduled_statuses.publish_now', defaultMessage: 'Post now' },
  delete: { id: 'scheduled_statuses.delete', defaultMessage: 'Delete' },
  retry: { id: 'scheduled_statuses.retry', defaultMessage: 'Retry' },
  stalledHint: { id: 'scheduled_statuses.stalled_hint', defaultMessage: 'This should already have been published. Changing the time queues it again.' },
  confirmDeleteTitle: { id: 'scheduled_statuses.confirm_delete.title', defaultMessage: 'Delete scheduled post?' },
  confirmDeleteMessage: { id: 'scheduled_statuses.confirm_delete.message', defaultMessage: 'This scheduled post will be discarded and never published.' },
  confirmDeleteButton: { id: 'scheduled_statuses.confirm_delete.button', defaultMessage: 'Delete' },
  confirmPublishNowTitle: { id: 'scheduled_statuses.confirm_publish_now.title', defaultMessage: 'Post now?' },
  confirmPublishNowMessage: { id: 'scheduled_statuses.confirm_publish_now.message', defaultMessage: 'This post goes out in about {seconds, plural, one {# second} other {# seconds}} instead of at the scheduled time.' },
  confirmPublishNowButton: { id: 'scheduled_statuses.confirm_publish_now.button', defaultMessage: 'Post now' },
});

export const ScheduledStatusItem = ({ scheduledStatus, showCheckbox, checked, onToggleCheck, isDue, isStalled, isEditing }) => {
  const intl = useIntl();
  const dispatch = useDispatch();

  const id = scheduledStatus.get('id');
  const scheduledAt = scheduledStatus.get('scheduled_at');
  const params = scheduledStatus.get('params') || ImmutableMap();
  const mediaAttachments = scheduledStatus.get('media_attachments') || ImmutableList();
  const failedAt = scheduledStatus.get('failed_at');
  const lastError = scheduledStatus.get('last_error');

  const text = params.get('text') || '';
  const spoilerText = params.get('spoiler_text') || '';
  const visibility = params.get('visibility') || 'public';
  const isReply = !!params.get('in_reply_to_id');
  const hasPoll = !!params.get('poll');

  // Its time has arrived and it has not failed: the worker is on it right now.
  const isPublishing = isDue && !failedAt;
  // Long past due with nothing happening — the queue is stuck, not the post.
  const isStuck = isStalled && !failedAt;

  const handleChangeTime = useCallback(() => {
    dispatch(openModal({ modalType: 'SCHEDULE', modalProps: { scheduledStatusId: id } }));
  }, [dispatch, id]);

  const handleEditContent = useCallback(() => {
    dispatch(setComposeToScheduledStatus(scheduledStatus.toJS()));
  }, [dispatch, scheduledStatus]);

  const reschedule = useCallback(() => (
    dispatch(updateScheduledStatus(id, { scheduled_at: toOffsetISOString(earliestScheduledAt()) })).catch(() => {})
  ), [dispatch, id]);

  const handlePublishNow = useCallback(() => {
    dispatch(openModal({
      modalType: 'CONFIRM',
      modalProps: {
        title: intl.formatMessage(messages.confirmPublishNowTitle),
        // The server refuses anything closer than its minimum offset, so this is
        // "as soon as allowed" rather than literally now — say so.
        message: intl.formatMessage(messages.confirmPublishNowMessage, { seconds: scheduledStatusMinimumOffset }),
        confirm: intl.formatMessage(messages.confirmPublishNowButton),
        onConfirm: reschedule,
      },
    }));
  }, [dispatch, intl, reschedule]);

  const handleDelete = useCallback(() => {
    dispatch(openModal({
      modalType: 'CONFIRM',
      modalProps: {
        title: intl.formatMessage(messages.confirmDeleteTitle),
        message: intl.formatMessage(messages.confirmDeleteMessage),
        confirm: intl.formatMessage(messages.confirmDeleteButton),
        onConfirm: () => {
          dispatch(deleteScheduledStatus(id)).catch(() => {});
        },
      },
    }));
  }, [dispatch, intl, id]);

  const handleToggleCheck = useCallback(() => {
    onToggleCheck(id);
  }, [onToggleCheck, id]);

  const menu = useMemo(() => [
    { text: intl.formatMessage(messages.changeTime), action: handleChangeTime },
    { text: intl.formatMessage(messages.editContent), action: handleEditContent },
    { text: intl.formatMessage(messages.publishNow), action: handlePublishNow },
    null,
    { text: intl.formatMessage(messages.delete), action: handleDelete, dangerous: true },
  ], [intl, handleChangeTime, handleEditContent, handlePublishNow, handleDelete]);

  // ScrollableList already wraps every child in an <article>.
  return (
    <div className={`scheduled-status ${failedAt ? 'scheduled-status--failed' : ''}`}>
      {showCheckbox && (
        <div className='scheduled-status__checkbox'>
          <CheckBox checked={checked} onChange={handleToggleCheck} />
        </div>
      )}

      <div className='scheduled-status__body'>
        <div className='scheduled-status__meta'>
          <Icon id='clock-o' icon={ClockFiveIcon} />
          <time dateTime={scheduledAt}>{formatScheduledAtLabel(intl, scheduledAt)}</time>

          {/* A past time must never read as "soon", which is what the relative
              timestamp would say once the moment has gone by. */}
          {isPublishing && (
            <span className='scheduled-status__meta__tag scheduled-status__meta__tag--active'>
              <FormattedMessage id='scheduled_statuses.publishing' defaultMessage='Publishing…' />
            </span>
          )}

          {isStuck && (
            <span
              className='scheduled-status__meta__tag scheduled-status__meta__tag--warning'
              title={intl.formatMessage(messages.stalledHint)}
            >
              <FormattedMessage id='scheduled_statuses.stalled' defaultMessage='Delayed' />
            </span>
          )}

          {!failedAt && !isPublishing && !isStuck && (
            <span className='scheduled-status__meta__relative'>
              <RelativeTimestamp timestamp={scheduledAt} futureDate short={false} />
            </span>
          )}

          <VisibilityIcon visibility={visibility} />

          {isReply && (
            <span className='scheduled-status__meta__tag'>
              <FormattedMessage id='scheduled_statuses.reply' defaultMessage='Reply' />
            </span>
          )}

          {hasPoll && (
            <span className='scheduled-status__meta__tag'>
              <FormattedMessage id='scheduled_statuses.poll' defaultMessage='Poll' />
            </span>
          )}

          {/* On desktop the composer sits in a side panel, so without this the
              "Edit post" action gives no feedback where the user clicked. */}
          {isEditing && (
            <span className='scheduled-status__meta__tag scheduled-status__meta__tag--active'>
              <FormattedMessage id='scheduled_statuses.editing' defaultMessage='Editing' />
            </span>
          )}
        </div>

        {spoilerText.length > 0 && (
          <div className='scheduled-status__spoiler'>
            <FormattedMessage id='scheduled_statuses.content_warning' defaultMessage='CW: {text}' values={{ text: spoilerText }} />
          </div>
        )}

        {text.length > 0 && <div className='scheduled-status__preview'>{text}</div>}

        {mediaAttachments.size > 0 && (
          <div className='scheduled-status__media'>
            {mediaAttachments.map(media => (media.get('preview_url') ? (
              <img
                key={media.get('id')}
                src={media.get('preview_url')}
                alt={media.get('description') || ''}
              />
            ) : (
              // Audio and some video attachments have no thumbnail.
              <span key={media.get('id')} className='scheduled-status__media__placeholder'>
                {media.get('type')}
              </span>
            ))).toArray()}
          </div>
        )}

        {failedAt && (
          <div className='scheduled-status__failure'>
            <Icon id='warning' icon={WarningIcon} />

            <div className='scheduled-status__failure__body'>
              <strong>
                <FormattedMessage id='scheduled_statuses.failed' defaultMessage='Publishing failed' />
              </strong>
              {lastError && <div className='scheduled-status__failure__reason'>{lastError}</div>}

              {/* Retrying as-is only helps a transient failure. When the cause is
                  the post itself (a deleted reply target, a missing attachment),
                  editing is the way out — so offer both. */}
              <div className='scheduled-status__failure__actions'>
                <button type='button' className='link-button' onClick={reschedule}>
                  {intl.formatMessage(messages.retry)}
                </button>
                <button type='button' className='link-button' onClick={handleEditContent}>
                  {intl.formatMessage(messages.editContent)}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className='scheduled-status__actions'>
        {/* During the seconds a post is being handed to the publisher, every one
            of these actions would be refused by the server (or worse, look like
            it worked). Offering none is clearer than offering four that fail. */}
        <Dropdown
          items={menu}
          icon='ellipsis-h'
          iconComponent={MoreHorizIcon}
          title={intl.formatMessage(messages.more)}
          disabled={isPublishing}
        />
      </div>
    </div>
  );
};

ScheduledStatusItem.propTypes = {
  scheduledStatus: ImmutablePropTypes.map.isRequired,
  showCheckbox: PropTypes.bool,
  checked: PropTypes.bool,
  onToggleCheck: PropTypes.func.isRequired,
  isDue: PropTypes.bool,
  isStalled: PropTypes.bool,
  isEditing: PropTypes.bool,
};
