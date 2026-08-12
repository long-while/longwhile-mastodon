// @_longwhile custom feature

import { useCallback } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { Link } from 'react-router-dom';

import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { ColumnBackButton } from 'mastodon/components/column_back_button';
import { useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from '../selectors';

const messages = defineMessages({
  leave: { id: 'messages.leave', defaultMessage: 'Leave conversation' },
});

interface Props {
  room?: ApiDmRoomJSON;
  onLeave: () => void;
}

export const RoomHeader: React.FC<Props> = ({ room, onLeave }) => {
  const intl = useIntl();

  const otherId = room?.accounts[0]?.id;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, otherId),
  );

  const handleLeave = useCallback(() => {
    onLeave();
  }, [onLeave]);

  const title =
    room?.title ??
    room?.accounts.map((entry) => entry.display_name || entry.username).join(', ');

  return (
    <div className='dm-room-header'>
      <ColumnBackButton />

      <div className='dm-room-header__identity'>
        {account && <Avatar account={account} size={32} />}

        <div className='dm-room-header__names'>
          {account && !room?.is_group ? (
            <Link to={`/@${account.acct}`} className='dm-room-header__title'>
              {title}
            </Link>
          ) : (
            <span className='dm-room-header__title'>{title}</span>
          )}

          {room?.is_group && (
            <span className='dm-room-header__subtitle'>
              <FormattedMessage
                id='messages.member_count'
                defaultMessage='{count} people'
                values={{ count: room.accounts.length + 1 }}
              />
            </span>
          )}
        </div>
      </div>

      <button
        type='button'
        className='dm-room-header__leave'
        onClick={handleLeave}
        title={intl.formatMessage(messages.leave)}
        aria-label={intl.formatMessage(messages.leave)}
      >
        <FormattedMessage id='messages.leave_short' defaultMessage='Leave' />
      </button>
    </div>
  );
};
