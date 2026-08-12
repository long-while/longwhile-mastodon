// @_longwhile custom feature

import { useMemo } from 'react';

import { List as ImmutableList } from 'immutable';

import { Avatar } from 'mastodon/components/avatar';
import AvatarCompositeRaw from 'mastodon/components/avatar_composite';
import type { Account } from 'mastodon/models/account';
import { useAppSelector } from 'mastodon/store';

import { selectMessageAccountsMap } from '../selectors';

const AvatarComposite = AvatarCompositeRaw as unknown as React.ComponentType<{
  accounts: ImmutableList<Account>;
  size: number;
}>;

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

  const list = useMemo(() => ImmutableList(present), [present]);

  if (present.length === 0) return null;

  const first = present[0];

  if (present.length === 1 && first) {
    return <Avatar account={first} size={size} />;
  }

  return <AvatarComposite accounts={list} size={size} />;
};
