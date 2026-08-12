import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import { useDispatch, useSelector } from 'react-redux';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { clearComposeSchedule, setComposeSchedule } from 'mastodon/actions/compose';
import { updateScheduledStatus } from 'mastodon/actions/scheduled_statuses';
import { IconButton } from 'mastodon/components/icon_button';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import { scheduledStatusMinimumOffset } from 'mastodon/initial_state';
import { serverClockSkew, serverNow } from 'mastodon/utils/server_clock';
import {
  buildDate,
  dayPeriodLabel,
  daysInMonth,
  defaultScheduledAt,
  fromClockParts,
  localTimeZoneLabel,
  toClockParts,
  toOffsetISOString,
  validateScheduledAt,
} from 'mastodon/utils/scheduled_at';

const messages = defineMessages({
  close: { id: 'schedule_modal.close', defaultMessage: 'Close' },
  month: { id: 'schedule_modal.month', defaultMessage: 'Month' },
  day: { id: 'schedule_modal.day', defaultMessage: 'Day' },
  year: { id: 'schedule_modal.year', defaultMessage: 'Year' },
  hour: { id: 'schedule_modal.hour', defaultMessage: 'Hour' },
  minute: { id: 'schedule_modal.minute', defaultMessage: 'Minute' },
  meridiem: { id: 'schedule_modal.meridiem', defaultMessage: 'AM/PM' },
});

const YEARS_AHEAD = 3;

// Below this the reading is indistinguishable from measurement noise (the Date
// header has second resolution and the response spends time in flight).
const CLOCK_SKEW_WARNING_MS = 30_000;

const range = (length, start = 0) => Array.from({ length }, (_, index) => index + start);

const pad2 = value => String(value).padStart(2, '0');

const ScheduleSelect = ({ label, value, onChange, options }) => (
  <select
    className='schedule-modal__select'
    value={value}
    onChange={onChange}
    aria-label={label}
    title={label}
  >
    {options.map(option => (
      <option key={option.value} value={option.value}>{option.label}</option>
    ))}
  </select>
);

ScheduleSelect.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
};

/**
 * Free-entry numeric field that corrects itself instead of complaining.
 *
 * A draft string is kept separately so a partially typed value is not rewritten
 * mid-keystroke ("0" on the way to "07" has to survive). Anything above `max` is
 * folded through `normalize` right away, because no further digit could rescue it;
 * anything below `min` is only corrected on blur, since it may still be a prefix.
 */
const NumberField = ({ label, value, min, max, normalize, onCommit }) => {
  const [draft, setDraft] = useState(() => pad2(value));

  useEffect(() => {
    setDraft(previous => (Number(previous) === value ? previous : pad2(value)));
  }, [value]);

  const handleChange = useCallback(event => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 2);

    if (digits === '') {
      setDraft('');
      return;
    }

    const typed = Number(digits);

    if (typed > max) {
      const corrected = normalize(typed);
      setDraft(pad2(corrected));
      onCommit(corrected);
      return;
    }

    setDraft(digits);

    if (typed >= min) {
      onCommit(typed);
    }
  }, [min, max, normalize, onCommit]);

  const handleBlur = useCallback(() => {
    const typed = Number(draft);

    if (draft === '' || typed < min) {
      setDraft(pad2(min));
      onCommit(min);
      return;
    }

    setDraft(pad2(value));
  }, [draft, min, value, onCommit]);

  // Selecting on focus makes a correction easy to type over.
  const handleFocus = useCallback(event => {
    event.target.select();
  }, []);

  return (
    <input
      className='schedule-modal__number'
      type='text'
      inputMode='numeric'
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      aria-label={label}
      title={label}
    />
  );
};

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  normalize: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/**
 * Two modes:
 *
 * - without `scheduledStatusId`, it edits the schedule of the post currently in
 *   the compose form;
 * - with one, it moves an existing scheduled post in time straight from the list.
 */
export const ScheduleModal = ({ onClose, scheduledStatusId: recordId }) => {
  const intl = useIntl();
  const dispatch = useDispatch();

  const isRecordMode = !!recordId;

  const composeScheduledAt = useSelector(state => state.getIn(['compose', 'scheduled_at']));
  const editingScheduledStatusId = useSelector(state => state.getIn(['compose', 'scheduled_status_id']));
  const hasPoll = useSelector(state => state.getIn(['compose', 'poll']) !== null);
  const recordScheduledAt = useSelector(state => state
    .getIn(['scheduled_statuses', 'items'])
    .find(item => item.get('id') === recordId)?.get('scheduled_at') ?? null);

  const scheduledAt = isRecordMode ? recordScheduledAt : composeScheduledAt;
  const alreadyScheduled = scheduledAt !== null;
  // The "clear" shortcut only makes sense for a draft that can simply go out now.
  const canClear = alreadyScheduled && !isRecordMode && !editingScheduledStatusId;

  const [selected, setSelected] = useState(() => {
    const initial = scheduledAt ? new Date(scheduledAt) : defaultScheduledAt();
    return Number.isNaN(initial.getTime()) ? defaultScheduledAt() : initial;
  });
  const [error, setError] = useState(() => validateScheduledAt(selected));

  // A dialog left open long enough for the chosen time to lapse must surface the
  // problem before the user hits confirm, so re-validate on a timer as well.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setError(validateScheduledAt(selected));
  }, [selected, tick]);

  const clock = toClockParts(selected);
  const clockSkewSeconds = Math.round(serverClockSkew() / 1000);
  const clockSkewed = Math.abs(serverClockSkew()) > CLOCK_SKEW_WARNING_MS;
  const timeZoneLabel = useMemo(() => localTimeZoneLabel(intl.locale), [intl.locale]);
  const lastDayOfMonth = daysInMonth(selected.getFullYear(), selected.getMonth());

  // Spans the selected year as well as the default range, so the select can
  // never end up with a value that is not among its options (which would render
  // as blank) — for instance when an existing post is scheduled far out, or when
  // the browser clock is wildly wrong.
  const currentYear = new Date(serverNow()).getFullYear();
  const selectedYear = selected.getFullYear();
  const firstYear = Math.min(currentYear, selectedYear);
  const lastYear = Math.max(currentYear + YEARS_AHEAD, selectedYear);
  const yearOptions = range(lastYear - firstYear + 1, firstYear).map(year => ({ value: year, label: String(year) }));
  const monthOptions = range(12).map(month => ({ value: month, label: pad2(month + 1) }));
  const hourOptions = range(12, 1).map(hour => ({ value: hour, label: pad2(hour) }));
  const meridiemOptions = [
    { value: 'am', label: dayPeriodLabel(intl.locale, 9) },
    { value: 'pm', label: dayPeriodLabel(intl.locale, 21) },
  ];

  /**
   * Applies a partial change to the selected date. `changes` may be a function of
   * the previous value, which keeps the hour/meridiem handlers from reading a
   * stale `selected` out of their closure.
   */
  const update = useCallback((changes) => {
    setSelected(previous => {
      const parts = {
        year: previous.getFullYear(),
        month: previous.getMonth(),
        day: previous.getDate(),
        hour: previous.getHours(),
        minute: previous.getMinutes(),
      };

      return buildDate({ ...parts, ...(typeof changes === 'function' ? changes(previous) : changes) });
    });
  }, []);

  const handleYearChange = useCallback(e => update({ year: Number(e.target.value) }), [update]);
  const handleMonthChange = useCallback(e => update({ month: Number(e.target.value) }), [update]);
  const handleDayCommit = useCallback(day => update({ day }), [update]);
  const handleMinuteCommit = useCallback(minute => update({ minute }), [update]);

  // A day past the end of the month becomes the last day of that month.
  const normalizeDay = useCallback(typed => Math.min(typed, lastDayOfMonth), [lastDayOfMonth]);
  // A minute past 59 is not a near miss, so it resets rather than saturating.
  const normalizeMinute = useCallback(() => 0, []);

  const handleHourChange = useCallback(e => {
    const hour12 = Number(e.target.value);
    update(previous => ({ hour: fromClockParts({ hour12, meridiem: toClockParts(previous).meridiem }) }));
  }, [update]);

  const handleMeridiemChange = useCallback(e => {
    const meridiem = e.target.value;
    update(previous => ({ hour: fromClockParts({ hour12: toClockParts(previous).hour12, meridiem }) }));
  }, [update]);

  const handleConfirm = useCallback(() => {
    // Re-check against the clock at the moment of confirmation, not at render.
    const reason = validateScheduledAt(selected);

    if (reason) {
      setError(reason);
      return;
    }

    if (isRecordMode) {
      // Keep the dialog open if the server rejects the new time (daily limit,
      // clock skew), so the error alert is not shown over an empty screen.
      dispatch(updateScheduledStatus(recordId, { scheduled_at: toOffsetISOString(selected) }))
        .then(() => onClose())
        .catch(() => {});
      return;
    }

    dispatch(setComposeSchedule(toOffsetISOString(selected)));
    onClose();
  }, [dispatch, onClose, selected, isRecordMode, recordId]);

  const handleRemove = useCallback(() => {
    dispatch(clearComposeSchedule());
    onClose();
  }, [dispatch, onClose]);

  // Wrapped so the click event is not passed on as ModalRoot's `ignoreFocus`.
  const handleCloseClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div className='modal-root__modal schedule-modal' role='dialog' aria-modal='true' aria-labelledby='schedule-modal-title'>
      <div className='schedule-modal__header'>
        <h1 id='schedule-modal-title'>
          <FormattedMessage id='schedule_modal.title' defaultMessage='Schedule' />
        </h1>

        <IconButton
          className='schedule-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={handleCloseClick}
        />
      </div>

      <div className='schedule-modal__body'>
        {/* The rows below already state the date, so this only adds how far off
            it is. */}
        <div className='schedule-modal__summary' aria-live='polite'>
          {!error && (
            <FormattedMessage
              id='schedule_modal.will_send_relative'
              defaultMessage='Goes out {relative}'
              values={{ relative: <RelativeTimestamp timestamp={selected.toISOString()} futureDate short={false} /> }}
            />
          )}
        </div>

        {error === 'past' && (
          <div className='schedule-modal__error'>
            <FormattedMessage id='schedule_modal.error.past' defaultMessage='That time has already passed.' />
          </div>
        )}

        {error === 'too_soon' && (
          <div className='schedule-modal__error'>
            <FormattedMessage
              id='schedule_modal.error.too_soon'
              defaultMessage='Pick a time at least {seconds, plural, one {# second} other {# seconds}} from now.'
              values={{ seconds: scheduledStatusMinimumOffset }}
            />
          </div>
        )}

        {clockSkewed && (
          <div className='schedule-modal__hint schedule-modal__hint--warning'>
            <FormattedMessage
              id='schedule_modal.clock_skew'
              defaultMessage="This device's clock is {seconds, plural, one {# second} other {# seconds}} off from the server. Times are matched to the server, so what you pick here is what goes out."
              values={{ seconds: Math.abs(clockSkewSeconds) }}
            />
          </div>
        )}

        {/* The units live in the translated sentence so each locale controls both
            the order of the fields and the words between them. */}
        <div className='schedule-modal__row'>
          <FormattedMessage
            id='schedule_modal.date_row'
            defaultMessage='{month} / {day} / {year} {weekday}'
            values={{
              year: (
                <ScheduleSelect
                  label={intl.formatMessage(messages.year)}
                  value={selected.getFullYear()}
                  onChange={handleYearChange}
                  options={yearOptions}
                />
              ),
              month: (
                <ScheduleSelect
                  label={intl.formatMessage(messages.month)}
                  value={selected.getMonth()}
                  onChange={handleMonthChange}
                  options={monthOptions}
                />
              ),
              day: (
                <NumberField
                  label={intl.formatMessage(messages.day)}
                  value={selected.getDate()}
                  min={1}
                  max={lastDayOfMonth}
                  normalize={normalizeDay}
                  onCommit={handleDayCommit}
                />
              ),
              weekday: (
                <span className='schedule-modal__weekday'>
                  {intl.formatDate(selected, { weekday: 'long' })}
                </span>
              ),
            }}
          />
        </div>

        <div className='schedule-modal__row'>
          <FormattedMessage
            id='schedule_modal.time_row'
            defaultMessage='{meridiem} {hour} : {minute}'
            values={{
              meridiem: (
                <ScheduleSelect
                  label={intl.formatMessage(messages.meridiem)}
                  value={clock.meridiem}
                  onChange={handleMeridiemChange}
                  options={meridiemOptions}
                />
              ),
              hour: (
                <ScheduleSelect
                  label={intl.formatMessage(messages.hour)}
                  value={clock.hour12}
                  onChange={handleHourChange}
                  options={hourOptions}
                />
              ),
              minute: (
                <NumberField
                  label={intl.formatMessage(messages.minute)}
                  value={clock.minute}
                  min={0}
                  max={59}
                  normalize={normalizeMinute}
                  onCommit={handleMinuteCommit}
                />
              ),
            }}
          />
        </div>

        <div className='schedule-modal__time-zone'>{timeZoneLabel}</div>

        {hasPoll && !isRecordMode && (
          <p className='schedule-modal__hint'>
            <FormattedMessage
              id='schedule_modal.poll_hint'
              defaultMessage='The poll starts counting down from the moment the post is published, not from now.'
            />
          </p>
        )}

        <button
          type='button'
          className='schedule-modal__confirm'
          onClick={handleConfirm}
          disabled={!!error}
        >
          {isRecordMode ? (
            <FormattedMessage id='schedule_modal.update' defaultMessage='Update' />
          ) : (
            <FormattedMessage id='schedule_modal.confirm' defaultMessage='Schedule' />
          )}
        </button>

        {canClear && (
          <button type='button' className='schedule-modal__clear' onClick={handleRemove}>
            <FormattedMessage id='schedule_modal.remove' defaultMessage='Clear' />
          </button>
        )}
      </div>

      {/* Pointless when the dialog was opened from the list itself. */}
      {!isRecordMode && (
        <div className='schedule-modal__footer'>
          <Link to='/scheduled_statuses' onClick={handleCloseClick}>
            <FormattedMessage id='schedule_modal.view_scheduled' defaultMessage='Scheduled posts' />
          </Link>
        </div>
      )}
    </div>
  );
};

ScheduleModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  scheduledStatusId: PropTypes.string,
};

// eslint-disable-next-line import/no-default-export
export default ScheduleModal;
