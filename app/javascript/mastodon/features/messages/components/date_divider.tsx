// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { FormattedDate, FormattedMessage } from 'react-intl';

interface Props {
  date: Date;
}

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

// 판정 기준은 **보는 사람의 지역 시간대**다. 같은 메시지가 사람에 따라 다른 날짜
// 아래 놓이는 것은 정상이다. (기획서 §4.3.4)
export const DateDivider: React.FC<Props> = ({ date }) => {
  const today     = startOfLocalDay(new Date());
  const thatDay   = startOfLocalDay(date);
  const dayLength = 24 * 60 * 60 * 1000;

  let label: React.ReactNode;

  if (thatDay === today) {
    label = <FormattedMessage id='messages.today' defaultMessage='Today' />;
  } else if (thatDay === today - dayLength) {
    label = (
      <FormattedMessage id='messages.yesterday' defaultMessage='Yesterday' />
    );
  } else {
    // 요일을 병기한다. 한국어에서 "4월 29일" 보다 "4월 29일 (수)" 가 훨씬 빨리
    // 읽힌다 — 며칠 전 대화를 되짚을 때 기준이 되는 것은 날짜보다 요일이다.
    // ko 로케일은 month/day 와 함께 쓰면 괄호까지 붙여준다.
    label = (
      <FormattedDate
        value={date}
        year={
          date.getFullYear() === new Date().getFullYear()
            ? undefined
            : 'numeric'
        }
        month='long'
        day='numeric'
        weekday='short'
      />
    );
  }

  return (
    <div className='dm-date-divider'>
      <span className='dm-date-divider__label'>{label}</span>
    </div>
  );
};
