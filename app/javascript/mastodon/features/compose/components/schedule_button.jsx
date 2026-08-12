import PropTypes from 'prop-types';
import { useCallback } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { useDispatch, useSelector } from 'react-redux';

import CalendarClockIcon from '@/styles/bird-theme-svg/calendar-clock.svg?react';
import { openModal } from 'mastodon/actions/modal';

import { IconButton } from '../../../components/icon_button';

const messages = defineMessages({
  schedule: { id: 'schedule_button.schedule', defaultMessage: 'Schedule post' },
  edit_schedule: { id: 'schedule_button.edit_schedule', defaultMessage: 'Edit schedule' },
});

const iconStyle = {
  height: null,
  lineHeight: '27px',
};

export const ScheduleButton = ({ disabled }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const active = useSelector(state => state.getIn(['compose', 'scheduled_at']) !== null);

  const handleClick = useCallback(() => {
    dispatch(openModal({ modalType: 'SCHEDULE', modalProps: {} }));
  }, [dispatch]);

  return (
    <div className='compose-form__schedule-button'>
      <IconButton
        icon='clock-o'
        iconComponent={CalendarClockIcon}
        title={intl.formatMessage(active ? messages.edit_schedule : messages.schedule)}
        disabled={disabled}
        onClick={handleClick}
        className={`compose-form__schedule-button-icon ${active ? 'active' : ''}`}
        inverted
        active={active}
        style={iconStyle}
      />
    </div>
  );
};

ScheduleButton.propTypes = {
  disabled: PropTypes.bool,
};
