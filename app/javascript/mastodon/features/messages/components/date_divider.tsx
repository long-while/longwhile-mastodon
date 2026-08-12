// @_longwhile custom feature

import { FormattedDate, FormattedMessage } from 'react-intl';

interface Props {
  date: Date;
}

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

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
      />
    );
  }

  return (
    <div className='dm-date-divider'>
      <span className='dm-date-divider__label'>{label}</span>
    </div>
  );
};
