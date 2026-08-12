// @_longwhile custom feature

import { useMemo } from 'react';

import { Avatar } from 'mastodon/components/avatar';
import type { Account } from 'mastodon/models/account';
import { useAppSelector } from 'mastodon/store';

import { selectMessageAccountsMap } from '../selectors';

const GROUP_SCALE = 0.72;

const GROUP_GAP = 2;

interface Props {
  accountIds: string[];
  size: number;
}

export const RoomAvatar: React.FC<Props> = ({ accountIds, size }) => {
  const accountsMap = useAppSelector(selectMessageAccountsMap);

  const key = accountIds.join(',');

  const present = useMemo(
    () =>
      accountIds
        .map((id) => accountsMap.get(id))
        .filter((account): account is Account => Boolean(account)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountsMap, key],
  );

  const maskImage = useMemo(() => {
    const inner = Math.round(size * GROUP_SCALE);

    const center = size - inner / 2;
    const radius = inner / 2 + GROUP_GAP;

    return `radial-gradient(circle ${radius}px at ${center}px ${center}px, rgba(0, 0, 0, 0) 98%, rgba(0, 0, 0, 1) 100%)`;
  }, [size]);

  if (present.length === 0) return null;

  const [back, front] = present;

  if (!back) return null;

  if (!front) {
    return <Avatar account={back} size={size} />;
  }

  const inner = Math.round(size * GROUP_SCALE);

  return (
    <div
      className='dm-room-avatar dm-room-avatar--group'
      style={{ width: size, height: size }}
    >
      <div
        className='dm-room-avatar__back'
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <Avatar account={back} size={inner} />
      </div>

      <div className='dm-room-avatar__front'>
        <Avatar account={front} size={inner} />
      </div>
    </div>
  );
};
