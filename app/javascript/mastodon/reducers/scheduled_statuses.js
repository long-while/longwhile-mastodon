import { Map as ImmutableMap, List as ImmutableList, fromJS, is } from 'immutable';

import {
  SCHEDULED_STATUSES_FETCH_REQUEST,
  SCHEDULED_STATUSES_FETCH_SUCCESS,
  SCHEDULED_STATUSES_FETCH_FAIL,
  SCHEDULED_STATUSES_EXPAND_REQUEST,
  SCHEDULED_STATUSES_EXPAND_SUCCESS,
  SCHEDULED_STATUSES_EXPAND_FAIL,
  SCHEDULED_STATUS_UPSERT,
  SCHEDULED_STATUS_REMOVE,
  SCHEDULED_STATUSES_USAGE_SUCCESS,
} from '../actions/scheduled_statuses';
import { scheduledStatusTotalLimit, scheduledStatusDailyLimit } from '../initial_state';

const initialState = ImmutableMap({
  items: ImmutableList(),
  isLoading: false,
  loaded: false,
  next: null,
  usage: ImmutableMap({
    total: 0,
    total_limit: scheduledStatusTotalLimit,
    today: 0,
    daily_limit: scheduledStatusDailyLimit,
    failed: 0,
  }),
});

const timeOf = item => Date.parse(item.get('scheduled_at') ?? '') || 0;

const byScheduledAt = (a, b) => {
  const difference = timeOf(a) - timeOf(b);

  if (difference !== 0) {
    return difference;
  }

  // Ids are snowflakes, so this keeps same-instant items in creation order.
  // Compared numerically: they are decimal strings of differing length, which
  // localeCompare would order wrongly ("10" before "9").
  return Number(a.get('id')) - Number(b.get('id'));
};

const upsert = (state, scheduledStatus) => {
  const item = fromJS(scheduledStatus);

  return state.update('items', items => {
    const index = items.findIndex(existing => existing.get('id') === item.get('id'));

    // verifyScheduledStatus re-fetches the same record every tick while a post is
    // publishing. Bailing out on an unchanged record keeps that from re-rendering
    // the entire list each time.
    if (index !== -1 && is(items.get(index), item)) {
      return items;
    }

    const next = index === -1 ? items.push(item) : items.set(index, item);

    return next.sort(byScheduledAt);
  });
};

export const scheduledStatusesReducer = (state = initialState, action) => {
  switch (action.type) {
  case SCHEDULED_STATUSES_FETCH_REQUEST:
  case SCHEDULED_STATUSES_EXPAND_REQUEST:
    return state.set('isLoading', true);
  case SCHEDULED_STATUSES_FETCH_FAIL:
  case SCHEDULED_STATUSES_EXPAND_FAIL:
    return state.set('isLoading', false);
  // fetchScheduledStatuses pulls the entire queue (see the note there), so this
  // replaces the list outright — published and remotely deleted records drop out
  // by simply not coming back.
  case SCHEDULED_STATUSES_FETCH_SUCCESS:
    return state.withMutations(map => {
      map.set('items', fromJS(action.scheduledStatuses).sort(byScheduledAt));
      map.set('next', action.next);
      map.set('isLoading', false);
      map.set('loaded', true);
    });
  case SCHEDULED_STATUSES_EXPAND_SUCCESS:
    return state.withMutations(map => {
      const incoming = fromJS(action.scheduledStatuses);
      const knownIds = state.get('items').map(item => item.get('id')).toSet();

      map.set('items', state.get('items').concat(incoming.filterNot(item => knownIds.has(item.get('id')))).sort(byScheduledAt));
      map.set('next', action.next);
      map.set('isLoading', false);
    });
  case SCHEDULED_STATUS_UPSERT:
    return upsert(state, action.scheduledStatus);
  case SCHEDULED_STATUS_REMOVE:
    return state.update('items', items => items.filterNot(item => item.get('id') === action.id));
  case SCHEDULED_STATUSES_USAGE_SUCCESS:
    return state.update('usage', usage => usage.merge(fromJS(action.usage)));
  default:
    return state;
  }
};
