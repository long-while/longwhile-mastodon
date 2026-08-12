import { scheduledStatusMinimumOffset } from 'mastodon/initial_state';

import { serverNow } from './server_clock';

const pad = (value, length = 2) => String(value).padStart(length, '0');

/**
 * Serialises a local Date as an ISO8601 string that carries the browser's UTC
 * offset, e.g. `2026-08-07T01:04:00+09:00`.
 *
 * `Date#toISOString` must not be used for this: it converts to UTC, which makes
 * the wall-clock time the user picked unrecoverable on the server side.
 *
 * @param {Date} date
 * @returns {string}
 */
export const toOffsetISOString = (date) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    'T',
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`,
  ].join('');
};

/** IANA name of the browser's time zone, e.g. `Asia/Seoul`. */
export const localTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
};

export const localTimeZoneLabel = (locale) => {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZoneName: 'long' }).formatToParts(new Date());
    return parts.find(part => part.type === 'timeZoneName')?.value ?? localTimeZone();
  } catch {
    return localTimeZone();
  }
};

export const dayPeriodLabel = (locale, hour24) => {
  const fallback = hour24 < 12 ? 'AM' : 'PM';

  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true }).formatToParts(new Date(2000, 0, 1, hour24));
    return parts.find(part => part.type === 'dayPeriod')?.value ?? fallback;
  } catch {
    return fallback;
  }
};

/** Number of days in the given month. `month` is 0-indexed. */
export const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/** Midnight of the given date, in the browser's time zone. */
export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Whether two dates fall on the same calendar day locally. */
export const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Narrow weekday initials in the viewer's locale, Sunday first — the `S M T W T
 * F S` header of the calendar. 2023-01-01 was a Sunday, so it anchors the week.
 */
export const weekdayInitials = (locale) => {
  try {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, index) => format.format(new Date(2023, 0, 1 + index)));
  } catch {
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  }
};

/** Month and year heading of the calendar, e.g. `August 2025`. */
export const formatMonthLabel = (intl, date) =>
  intl.formatDate(date, { year: 'numeric', month: 'long' });

/**
 * The date text box, e.g. `2025. 8. 17.` in Korean or `8/17/2025` in English.
 * Deliberately the locale's own numeric form so that whatever the user types
 * back matches what they were shown.
 */
export const formatDateInput = (intl, date) =>
  intl.formatDate(date, { year: 'numeric', month: 'numeric', day: 'numeric' });

/**
 * The order in which the locale writes year, month and day, so free-typed input
 * can be read back the same way it is displayed.
 *
 * @returns {Array<'year'|'month'|'day'>}
 */
const dateFieldOrder = (locale) => {
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date())
      .filter(part => ['year', 'month', 'day'].includes(part.type))
      .map(part => part.type);
  } catch {
    return ['year', 'month', 'day'];
  }
};

/**
 * Reads a hand-typed date. Separators are ignored entirely — only the three
 * number groups matter — so `2025. 8. 17.`, `2025-08-17` and `2025 8 17` are all
 * accepted in a locale that writes year first.
 *
 * The day is clamped to the length of the month rather than rolling over, so
 * "February 31st" becomes the 28th instead of silently landing in March.
 *
 * @returns {Date|null} null when the text cannot be read as a date
 */
export const parseDateInput = (locale, text) => {
  const groups = String(text).match(/\d+/g);

  if (!groups || groups.length < 3) {
    return null;
  }

  const order = dateFieldOrder(locale);
  const values = {};

  order.forEach((field, index) => {
    values[field] = Number(groups[index]);
  });

  let { year, month, day } = values;

  if ([year, month, day].some(value => !Number.isFinite(value))) {
    return null;
  }

  // A two-digit year is the current century, matching what the box displays.
  if (year < 100) {
    year += Math.floor(new Date().getFullYear() / 100) * 100;
  }

  if (year < 1000 || month < 1 || month > 12 || day < 1) {
    return null;
  }

  day = Math.min(day, daysInMonth(year, month - 1));

  return new Date(year, month - 1, day);
};

/**
 * Splits the wait until publication into days, hours and minutes for the
 * "3 days 7 hours 5 minutes from now" line. Seconds are dropped rather than
 * rounded so the figure never claims more time than is actually left.
 */
export const countdownParts = (date, from = serverNow()) => {
  const totalMinutes = Math.max(0, Math.floor((date.getTime() - from) / 60000));

  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
};

/**
 * Builds a Date from select-box values, clamping the day to the selected
 * month so combinations such as February 30th cannot be produced.
 */
export const buildDate = ({ year, month, day, hour, minute }) => {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return new Date(year, month, safeDay, hour, minute, 0, 0);
};

/**
 * The earliest instant the server will accept. The margin covers the round trip;
 * the server clock offset is handled by {@link serverNow}, so a browser whose
 * clock is behind does not produce a rejected request.
 */
export const earliestScheduledAt = (marginSeconds = 15) =>
  new Date(serverNow() + (scheduledStatusMinimumOffset + marginSeconds) * 1000);

/** Minute granularity of the dialog's minute select. */
export const MINUTE_STEP = 5;

/**
 * Default suggestion when opening the dialog: at least ten minutes out, rounded
 * up to the next {@link MINUTE_STEP} boundary so the minute select opens on its
 * tidy 5-minute list rather than dropping straight into free-entry mode.
 */
export const defaultScheduledAt = () => {
  const date = new Date(serverNow() + 10 * 60 * 1000);
  date.setSeconds(0, 0);

  const remainder = date.getMinutes() % MINUTE_STEP;

  if (remainder !== 0) {
    date.setMinutes(date.getMinutes() + (MINUTE_STEP - remainder));
  }

  return date;
};

/**
 * Validates a candidate publication time the way the server will, i.e. against
 * the server's clock rather than the browser's.
 *
 * @returns {'past'|'too_soon'|null} the reason it is unusable, or null
 */
export const validateScheduledAt = (date) => {
  if (!date || Number.isNaN(date.getTime())) {
    return 'past';
  }

  const now = serverNow();

  if (date.getTime() <= now) {
    return 'past';
  }

  if (date.getTime() < now + scheduledStatusMinimumOffset * 1000) {
    return 'too_soon';
  }

  return null;
};

export const formatScheduledAtLabel = (intl, scheduledAt) => {
  if (!scheduledAt) {
    return '';
  }

  const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = intl.formatDate(date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const time = intl.formatTime(date, { hour: 'numeric', minute: '2-digit' });

  return `${day} ${time}`;
};

/** 12-hour clock parts of a Date, for the hour/minute/meridiem selects. */
export const toClockParts = (date) => {
  const hours24 = date.getHours();

  return {
    hour12: hours24 % 12 === 0 ? 12 : hours24 % 12,
    minute: date.getMinutes(),
    meridiem: hours24 < 12 ? 'am' : 'pm',
  };
};

/** Inverse of {@link toClockParts}. */
export const fromClockParts = ({ hour12, meridiem }) => {
  if (meridiem === 'am') {
    return hour12 === 12 ? 0 : hour12;
  }

  return hour12 === 12 ? 12 : hour12 + 12;
};

export const formatScheduledAtShort = (intl, scheduledAt) => {
  if (!scheduledAt) {
    return '';
  }

  const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = `${pad(date.getFullYear() % 100)}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  const weekday = intl.formatDate(date, { weekday: 'short' });
  const { hour12, minute, meridiem } = toClockParts(date);

  return `${day} (${weekday}) ${hour12}:${pad(minute)} ${meridiem.toUpperCase()}`;
};
