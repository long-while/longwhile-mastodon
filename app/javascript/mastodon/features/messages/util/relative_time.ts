// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   목록 카드의 상대 시각.
//   근거: dm-chat-phase-2.md §3.4, 기획서 §4.2.4
//
//   기존 RelativeTimestamp 컴포넌트는 규칙이 달라 재사용하지 않는다. 그쪽은
//   "3분"처럼 단위만 적는데, 한국어에서는 "3분 전"이라야 자연스럽다. 형식 문자열을
//   번역 파일에 두고 여기서 고른다.

import { defineMessages } from 'react-intl';
import type { IntlShape } from 'react-intl';

const messages = defineMessages({
  now: { id: 'messages.time.now', defaultMessage: 'now' },
  minutes: { id: 'messages.time.minutes', defaultMessage: '{count}m ago' },
  hours: { id: 'messages.time.hours', defaultMessage: '{count}h ago' },
  yesterday: { id: 'messages.time.yesterday', defaultMessage: 'Yesterday' },
  days: { id: 'messages.time.days', defaultMessage: '{count}d ago' },
});

const MINUTE = 60 * 1000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

/**
 * 7단계로 접는다.
 *
 *   1분 미만        지금
 *   1시간 미만      n분 전
 *   같은 날         n시간 전
 *   어제            어제
 *   7일 미만        n일 전
 *   올해            8월 3일
 *   그 이전         2025년 12월 4일
 * @param intl react-intl 컨텍스트
 * @param timestamp ISO 8601 시각
 * @returns 사람이 읽는 한 조각
 */
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

  // **요일을 쓰지 않는다.** 한때 여기서 `formatDate(date, { weekday: 'short' })`
  // 를 썼는데, 한국어의 짧은 요일은 **한 글자**다 — 일요일이 "일" 로 나온다.
  // 그런데 위아래 칸이 "3분 전" · "5시간 전" 이라, 그 자리의 "일" 은 요일이
  // 아니라 **숫자가 빠진 "n일"** 로 읽힌다. 실제로 고장으로 신고됐다.
  //
  // 영어는 "Sun" 이라 헷갈리지 않지만, 언어마다 다른 규칙을 두면 이 함수가
  // 로케일을 알아야 한다. 세는 단위로 통일해 위의 사다리(분 → 시간 → 일)를
  // 그대로 잇는다.
  //
  // `Math.round` 를 쓴다. 두 값 모두 그 날의 0시라 보통은 DAY 의 배수지만,
  // 서머타임이 있는 지역에서는 23시간 또는 25시간이 되어 `floor` 가 하루를 깎는다.
  if (today - thatDay < 7 * DAY) {
    return intl.formatMessage(messages.days, {
      count: Math.round((today - thatDay) / DAY),
    });
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
