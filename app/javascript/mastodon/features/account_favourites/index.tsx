import { useEffect, useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import {
  fetchFavouritedStatuses,
  expandFavouritedStatuses,
} from 'mastodon/actions/favourites';
import { ColumnBackButton } from 'mastodon/components/column_back_button';
import StatusList from 'mastodon/components/status_list';
import { AccountHeader } from 'mastodon/features/account_timeline/components/account_header';
import BundleColumnError from 'mastodon/features/ui/components/bundle_column_error';
import Column from 'mastodon/features/ui/components/column';
import { useAccountId } from 'mastodon/hooks/useAccountId';
import { me } from 'mastodon/initial_state';
import { getStatusList } from 'mastodon/selectors';
import { useAppSelector, useAppDispatch } from 'mastodon/store';

/**
 * The favourites tab on a profile.
 *
 * Only ever the viewer's own: the API behind this returns the favourites of
 * whoever is logged in, with no way to ask for someone else's, and the tab is
 * only offered on your own profile. Anyone who reaches another account's URL by
 * hand gets the not-found column rather than a page quietly showing them their
 * own list under a stranger's header.
 */
export const AccountFavourites: React.FC<{
  multiColumn: boolean;
}> = ({ multiColumn }) => {
  const dispatch = useAppDispatch();
  const accountId = useAccountId();
  const isOwnProfile = !!accountId && accountId === me;

  const statusIds = useAppSelector((state) =>
    getStatusList(state, 'favourites'),
  );
  const isLoading = useAppSelector(
    (state) =>
      state.status_lists.getIn(['favourites', 'isLoading'], true) as boolean,
  );
  const hasMore = useAppSelector(
    (state) => !!state.status_lists.getIn(['favourites', 'next']),
  );

  useEffect(() => {
    if (isOwnProfile) {
      dispatch(fetchFavouritedStatuses());
    }
  }, [dispatch, isOwnProfile]);

  const handleLoadMore = useCallback(() => {
    dispatch(expandFavouritedStatuses());
  }, [dispatch]);

  // `undefined` still means the lookup is in flight; only a resolved account
  // that is not ours is a dead end.
  if (accountId === null || (accountId && !isOwnProfile)) {
    return <BundleColumnError multiColumn={multiColumn} errorType='routing' />;
  }

  const emptyMessage = (
    <FormattedMessage
      id='empty_column.favourited_statuses'
      defaultMessage="You don't have any favorite posts yet. When you favorite one, it will show up here."
    />
  );

  return (
    <Column>
      <ColumnBackButton />

      <StatusList
        prepend={accountId && <AccountHeader accountId={accountId} />}
        alwaysPrepend
        scrollKey='account_favourites'
        statusIds={statusIds}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        emptyMessage={emptyMessage}
        bindToDocument={!multiColumn}
        timelineId='favourites'
      />
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default AccountFavourites;
