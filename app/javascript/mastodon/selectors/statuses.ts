import { createSelector } from '@reduxjs/toolkit';
import { OrderedSet as ImmutableOrderedSet } from 'immutable';

import type { RootState } from 'mastodon/store';

const EMPTY_ITEMS = ImmutableOrderedSet<string>();

export const getStatusList = createSelector(
  [
    (
      state: RootState,
      type:
        | 'favourites'
        | 'bookmarks'
        | 'pins'
        | 'trending'
        | `bookmarks:${string}`,
    ) =>
      state.status_lists.getIn(
        [type, 'items'],
        EMPTY_ITEMS,
      ) as ImmutableOrderedSet<string>,
  ],
  (items) => items.toList(),
);
