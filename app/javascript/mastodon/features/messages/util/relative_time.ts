// @_longwhile custom feature

import { defineMessages } from 'react-intl';
import type { IntlShape } from 'react-intl';

const messages = defineMessages({
  now: { id: 'messages.time.now', defaultMessage: 'now' },
  minutes: { id: 'messages.time.minutes', defaultMessage: '{count}m ago' },
  hours: { id: 'messages.time.hours', defaultMessage: '{count}h ago' },
  yesterday: { id: 'messages.time.yesterday', defaultMessage: 'Yesterday' },
});

const MINUTE = 60 * 1000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

export const relativeTimeLabel = (intl: IntlShape, timestamp: string) => {
  const date = new Date(timestamp);
  const now  = new Date();

  const elapsed = now.getTime() - date.getTime();
  const today   = startOfLocalDay(now);
  const thatDay = startOfLocalDay(date);

  if (elapsed < MINUTE) return intl.formatMessage(messages.now);

  if (elapsed < HOUR) {
    return intl.formatMessage(messages.minutes, {
      count: Math.floor(elapsed / MINUTE),
    });
  }

  if (thatDay === today) {
    return intl.formatMessage(messages.hours, {
      count: Math.floor(elapsed / HOUR),
    });
  }

  if (thatDay === today - DAY) return intl.formatMessage(messages.yesterday);

  if (today - thatDay < 7 * DAY) {
    return intl.formatDate(date, { weekday: 'short' });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return intl.formatDate(date, { month: 'long', day: 'numeric' });
  }

  return intl.formatDate(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
