// @_longwhile custom feature

import { FormattedMessage } from 'react-intl';

export const RoomIntro: React.FC = () => (
  <div className='dm-room-intro'>
    <p className='dm-room-intro__notice'>
      <FormattedMessage
        id='messages.intro.notice'
        defaultMessage='All messages on this server can be read by moderators. Please avoid sending anything sensitive.'
      />
    </p>
  </div>
);
