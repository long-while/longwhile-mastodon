import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import classNames from 'classnames';

import { useDispatch, useSelector } from 'react-redux';

import ArrowDropDownIcon from '@/material-icons/400-24px/arrow_drop_down.svg?react';
import ChevronLeftIcon from '@/material-icons/400-24px/chevron_left.svg?react';
import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import { clearComposeSchedule, setComposeSchedule } from 'mastodon/actions/compose';
import { updateScheduledStatus } from 'mastodon/actions/scheduled_statuses';
import { DropdownSelector } from 'mastodon/components/dropdown_selector';
import { Icon } from 'mastodon/components/icon';
import { scheduledStatusMinimumOffset } from 'mastodon/initial_state';
import { serverClockSkew, serverNow } from 'mastodon/utils/server_clock';
import {
  buildDate,
  countdownParts,
  dayPeriodLabel,
  defaultScheduledAt,
  formatDateInput,
  formatMonthLabel,
  fromClockParts,
  isSameDay,
  localTimeZoneLabel,
  parseDateInput,
  startOfDay,
  toClockParts,
  toOffsetISOString,
  validateScheduledAt,
  weekdayInitials,
} from 'mastodon/utils/scheduled_at';

const messages = defineMessages({
  date: { id: 'schedule_modal.date', defaultMessage: 'Date' },
  hour: { id: 'schedule_modal.hour', defaultMessage: 'Hour' },
  meridiem: { id: 'schedule_modal.meridiem', defaultMessage: 'AM/PM' },
  minute: { id: 'schedule_modal.minute', defaultMessage: 'Minute' },
  nextMonth: { id: 'schedule_modal.next_month', defaultMessage: 'Next month' },
  previousMonth: { id: 'schedule_modal.previous_month', defaultMessage: 'Previous month' },
});

// Below this the reading is indistinguishable from measurement noise (the Date
// header has second resolution and the response spends time in flight).
const CLOCK_SKEW_WARNING_MS = 30_000;

// Six weeks covers every month, so the dialog keeps one height instead of
// growing and shrinking as the user pages through.
const CALENDAR_ROWS = 6;
const CALENDAR_CELLS = CALENDAR_ROWS * 7;

const range = (length, start = 0) => Array.from({ length }, (_, index) => index + start);

/**
 * Free-entry numeric field that corrects itself instead of complaining.
 *
 * A draft string is kept separately so a partially typed value is not rewritten
 * mid-keystroke ("1" on the way to "12" has to survive). Anything above `max` is
 * folded through `normalize` right away, because no further digit could rescue it;
 * anything below `min` is only corrected on blur, since it may still be a prefix.
 *
 * Arrow Up/Down step the value and wrap around, as in a native time input.
 */
const NumberField = ({ label, suffix, value, min, max, normalize, onCommit }) => {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(previous => (Number(previous) === value ? previous : String(value)));
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
      setDraft(String(corrected));
      onCommit(corrected);
      return;
    }

    setDraft(digits);

    if (typed >= min) {
      onCommit(typed);
    }
  }, [min, max, normalize, onCommit]);

  const handleKeyDown = useCallback(event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();

    const span = max - min + 1;
    const step = event.key === 'ArrowUp' ? 1 : -1;
    const next = min + (((value - min + step) % span) + span) % span;

    setDraft(String(next));
    onCommit(next);
  }, [value, min, max, onCommit]);

  const handleBlur = useCallback(() => {
    const typed = Number(draft);

    if (draft === '' || typed < min) {
      setDraft(String(min));
      onCommit(min);
      return;
    }

    setDraft(String(value));
  }, [draft, min, value, onCommit]);

  // Selecting on focus makes a correction easy to type over.
  const handleFocus = useCallback(event => {
    event.target.select();
  }, []);

  return (
    <label className='schedule-modal__field'>
      <input
        className='schedule-modal__field__input'
        type='text'
        inputMode='numeric'
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        aria-label={label}
      />
      <span className='schedule-modal__field__suffix'>{suffix}</span>
    </label>
  );
};

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  suffix: PropTypes.node,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  normalize: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/**
 * AM/PM picker built from the same parts as the composer's visibility dropdown,
 * so it follows the app's own styling rather than the operating system's.
 *
 * The list is positioned against the button rather than portalled: it holds two
 * rows, and the dialog always has room for them below the field.
 */
const MeridiemDropdown = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const handleToggle = useCallback(() => {
    setOpen(previous => !previous);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleChange = useCallback(next => {
    onChange(next);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback(event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }, [open]);

  const current = options.find(option => option.value === value) ?? options[0];

  return (
    <div className='schedule-modal__meridiem' ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type='button'
        className={classNames('schedule-modal__meridiem__button', { active: open })}
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={label}
        onClick={handleToggle}
      >
        <span>{current.text}</span>
        <Icon id='caret-down' icon={ArrowDropDownIcon} />
      </button>

      {open && (
        <div className='schedule-modal__meridiem__dropdown'>
          <DropdownSelector
            classNamePrefix='schedule-modal__meridiem'
            items={options}
            value={value}
            onClose={handleClose}
            onChange={handleChange}
          />
        </div>
      )}
    </div>
  );
};

MeridiemDropdown.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
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

  // The month the grid is showing, which the user can page through without
  // changing what is selected.
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

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
  const weekdays = useMemo(() => weekdayInitials(intl.locale), [intl.locale]);
  const today = useMemo(() => startOfDay(new Date(serverNow())), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keep the grid on the month that holds the selection, including when the date
  // was typed into the text box rather than clicked.
  useEffect(() => {
    setVisibleMonth(previous => (
      previous.getFullYear() === selected.getFullYear() && previous.getMonth() === selected.getMonth()
        ? previous
        : new Date(selected.getFullYear(), selected.getMonth(), 1)
    ));
  }, [selected]);

  // ── date text box ────────────────────────────────────────────────────────────

  const [dateDraft, setDateDraft] = useState(() => formatDateInput(intl, selected));

  // Only rewrite the box when it no longer describes the selection, so a
  // half-typed date is not clobbered on every keystroke.
  useEffect(() => {
    setDateDraft(previous => {
      const parsed = parseDateInput(intl.locale, previous);
      return parsed && isSameDay(parsed, selected) ? previous : formatDateInput(intl, selected);
    });
  }, [selected, intl]);

  const handleDateDraftChange = useCallback(event => {
    const text = event.target.value;
    setDateDraft(text);

    const parsed = parseDateInput(intl.locale, text);

    if (parsed) {
      update({ year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() });
    }
  }, [intl.locale, update]);

  // Whatever survived typing is normalised back to the locale's own spelling.
  const handleDateDraftBlur = useCallback(() => {
    setDateDraft(formatDateInput(intl, selected));
  }, [intl, selected]);

  // ── calendar ─────────────────────────────────────────────────────────────────

  const shiftMonth = useCallback(offset => {
    setVisibleMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
  }, []);

  const handlePreviousMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const handleNextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);

  const handleDayClick = useCallback(event => {
    const day = Number(event.currentTarget.dataset.day);
    update({ year: visibleMonth.getFullYear(), month: visibleMonth.getMonth(), day });
  }, [update, visibleMonth]);

  // Always six weeks, starting on the Sunday on or before the 1st. The days that
  // spill in from the neighbouring months are shown greyed, the way a calendar
  // normally does, and keep the dialog from resizing month to month.
  const cells = useMemo(() => {
    const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
    const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstWeekday);

    return range(CALENDAR_CELLS).map(offset =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset));
  }, [visibleMonth]);

  // ── time ─────────────────────────────────────────────────────────────────────

  const meridiemOptions = useMemo(() => [
    { value: 'am', text: dayPeriodLabel(intl.locale, 9), meta: '' },
    { value: 'pm', text: dayPeriodLabel(intl.locale, 21), meta: '' },
  ], [intl.locale]);

  const handleHourCommit = useCallback(hour12 => {
    update(previous => ({ hour: fromClockParts({ hour12, meridiem: toClockParts(previous).meridiem }) }));
  }, [update]);

  const handleMinuteCommit = useCallback(minute => update({ minute }), [update]);

  const handleMeridiemChange = useCallback(meridiem => {
    update(previous => ({ hour: fromClockParts({ hour12: toClockParts(previous).hour12, meridiem }) }));
  }, [update]);

  // An hour past 12 has no reading on a 12-hour clock, so it saturates.
  const normalizeHour = useCallback(() => 12, []);
  // A minute past 59 is not a near miss, so it resets rather than saturating.
  const normalizeMinute = useCallback(() => 0, []);

  // ── actions ──────────────────────────────────────────────────────────────────

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

  const handleClear = useCallback(() => {
    dispatch(clearComposeSchedule());
    onClose();
  }, [dispatch, onClose]);

  // Wrapped so the click event is not passed on as ModalRoot's `ignoreFocus`.
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const countdown = countdownParts(selected);

  return (
    <div className='modal-root__modal schedule-modal' role='dialog' aria-modal='true' aria-labelledby='schedule-modal-title'>
      <h1 className='schedule-modal__title' id='schedule-modal-title'>
        <FormattedMessage id='schedule_modal.title' defaultMessage='Pick a date and time' />
      </h1>

      <div className='schedule-modal__columns'>
        <div className='schedule-modal__calendar'>
          <div className='schedule-modal__calendar__header'>
            <span className='schedule-modal__calendar__month'>
              {formatMonthLabel(intl, visibleMonth)}
            </span>

            <div className='schedule-modal__calendar__nav'>
              <button
                type='button'
                onClick={handlePreviousMonth}
                aria-label={intl.formatMessage(messages.previousMonth)}
              >
                <Icon id='chevron-left' icon={ChevronLeftIcon} />
              </button>
              <button
                type='button'
                onClick={handleNextMonth}
                aria-label={intl.formatMessage(messages.nextMonth)}
              >
                <Icon id='chevron-right' icon={ChevronRightIcon} />
              </button>
            </div>
          </div>

          <div className='schedule-modal__calendar__weekdays' aria-hidden='true'>
            {weekdays.map((initial, index) => (
              <span key={index}>{initial}</span>
            ))}
          </div>

          <div className='schedule-modal__calendar__grid'>
            {cells.map(date => {
              const inMonth = date.getMonth() === visibleMonth.getMonth();

              if (!inMonth) {
                return (
                  <span
                    key={date.getTime()}
                    className='schedule-modal__calendar__day schedule-modal__calendar__day--outside'
                    aria-hidden='true'
                  >
                    {date.getDate()}
                  </span>
                );
              }

              const isSelected = isSameDay(date, selected);
              const isToday = isSameDay(date, today);
              // A day that is already over cannot hold a future publication time.
              const isPast = date < today;

              return (
                <button
                  key={date.getTime()}
                  type='button'
                  data-day={date.getDate()}
                  className={classNames('schedule-modal__calendar__day', {
                    'schedule-modal__calendar__day--selected': isSelected,
                    'schedule-modal__calendar__day--today': isToday,
                  })}
                  onClick={handleDayClick}
                  disabled={isPast}
                  aria-pressed={isSelected}
                  aria-label={intl.formatDate(date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className='schedule-modal__inputs'>
          <input
            className='schedule-modal__date'
            type='text'
            inputMode='numeric'
            value={dateDraft}
            onChange={handleDateDraftChange}
            onBlur={handleDateDraftBlur}
            aria-label={intl.formatMessage(messages.date)}
          />

          <div className='schedule-modal__time'>
            <MeridiemDropdown
              label={intl.formatMessage(messages.meridiem)}
              value={clock.meridiem}
              options={meridiemOptions}
              onChange={handleMeridiemChange}
            />

            <NumberField
              label={intl.formatMessage(messages.hour)}
              suffix={<FormattedMessage id='schedule_modal.hour_suffix' defaultMessage='h' />}
              value={clock.hour12}
              min={1}
              max={12}
              normalize={normalizeHour}
              onCommit={handleHourCommit}
            />

            <NumberField
              label={intl.formatMessage(messages.minute)}
              suffix={<FormattedMessage id='schedule_modal.minute_suffix' defaultMessage='m' />}
              value={clock.minute}
              min={0}
              max={59}
              normalize={normalizeMinute}
              onCommit={handleMinuteCommit}
            />
          </div>

          <div className='schedule-modal__summary' aria-live='polite'>
            {error === 'past' && (
              <span className='schedule-modal__summary--error'>
                <FormattedMessage id='schedule_modal.error.past' defaultMessage='That time has already passed.' />
              </span>
            )}

            {error === 'too_soon' && (
              <span className='schedule-modal__summary--error'>
                <FormattedMessage
                  id='schedule_modal.error.too_soon'
                  defaultMessage='Pick a time at least {seconds, plural, one {# second} other {# seconds}} from now.'
                  values={{ seconds: scheduledStatusMinimumOffset }}
                />
              </span>
            )}

            {!error && (
              <FormattedMessage
                id='schedule_modal.sends_in'
                defaultMessage='Sends in {days, plural, =0 {} one {# day } other {# days }}{hours, plural, =0 {} one {# hour } other {# hours }}{minutes, plural, one {# minute} other {# minutes}}'
                values={countdown}
              />
            )}
          </div>

          <div className='schedule-modal__time-zone'>{timeZoneLabel}</div>

          {clockSkewed && (
            <p className='schedule-modal__hint schedule-modal__hint--warning'>
              <FormattedMessage
                id='schedule_modal.clock_skew'
                defaultMessage="This device's clock is {seconds, plural, one {# second} other {# seconds}} off from the server. Times are matched to the server, so what you pick here is what goes out."
                values={{ seconds: Math.abs(clockSkewSeconds) }}
              />
            </p>
          )}

          {hasPoll && !isRecordMode && (
            <p className='schedule-modal__hint'>
              <FormattedMessage
                id='schedule_modal.poll_hint'
                defaultMessage='The poll starts counting down from the moment the post is published, not from now.'
              />
            </p>
          )}
        </div>
      </div>

      <div className='schedule-modal__actions'>
        {canClear && (
          <button type='button' className='schedule-modal__text-button schedule-modal__text-button--clear' onClick={handleClear}>
            <FormattedMessage id='schedule_modal.remove' defaultMessage='Clear' />
          </button>
        )}

        <button type='button' className='schedule-modal__text-button' onClick={handleCancel}>
          <FormattedMessage id='schedule_modal.cancel' defaultMessage='Cancel' />
        </button>

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
      </div>
    </div>
  );
};

ScheduleModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  scheduledStatusId: PropTypes.string,
};

// eslint-disable-next-line import/no-default-export
export default ScheduleModal;
