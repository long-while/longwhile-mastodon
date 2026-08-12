// @_longwhile custom feature

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

const messages = defineMessages({
  label: { id: 'messages.unread_divider', defaultMessage: 'Unread' },
});

export const UnreadDivider: React.FC = () => {
  const intl = useIntl();

  return (
    <div
      className='dm-unread-divider'
      role='separator'
      aria-label={intl.formatMessage(messages.label)}
    >
      <span className='dm-unread-divider__label'>
        <FormattedMessage id='messages.unread_divider' defaultMessage='Unread' />
      </span>
    </div>
  );
};
