import { defineMessages } from 'react-intl';

import api, { getLinks } from 'mastodon/api';
import { recordServerClockSkew } from 'mastodon/utils/server_clock';

import { showAlert, showAlertForError } from './alerts';

const messages = defineMessages({
  gone: { id: 'scheduled_statuses.gone', defaultMessage: 'That scheduled post was already published or removed.' },
});

export const SCHEDULED_STATUSES_FETCH_REQUEST = 'SCHEDULED_STATUSES_FETCH_REQUEST';
export const SCHEDULED_STATUSES_FETCH_SUCCESS = 'SCHEDULED_STATUSES_FETCH_SUCCESS';
export const SCHEDULED_STATUSES_FETCH_FAIL    = 'SCHEDULED_STATUSES_FETCH_FAIL';

export const SCHEDULED_STATUSES_EXPAND_REQUEST = 'SCHEDULED_STATUSES_EXPAND_REQUEST';
export const SCHEDULED_STATUSES_EXPAND_SUCCESS = 'SCHEDULED_STATUSES_EXPAND_SUCCESS';
export const SCHEDULED_STATUSES_EXPAND_FAIL    = 'SCHEDULED_STATUSES_EXPAND_FAIL';

export const SCHEDULED_STATUS_UPSERT = 'SCHEDULED_STATUS_UPSERT';
export const SCHEDULED_STATUS_REMOVE = 'SCHEDULED_STATUS_REMOVE';

export const SCHEDULED_STATUSES_USAGE_SUCCESS = 'SCHEDULED_STATUSES_USAGE_SUCCESS';

export const upsertScheduledStatus = scheduledStatus => ({
  type: SCHEDULED_STATUS_UPSERT,
  scheduledStatus,
});

export const removeScheduledStatus = id => ({
  type: SCHEDULED_STATUS_REMOVE,
  id,
});

export const fetchScheduledStatusesUsage = () => (dispatch) =>
  api().get('/api/v1/scheduled_statuses/usage').then(response => {
    // Cheapest possible clock reference: this runs at app start and after every
    // change, so the schedule dialog always has a fresh reading.
    recordServerClockSkew(response.headers?.date);
    dispatch({ type: SCHEDULED_STATUSES_USAGE_SUCCESS, usage: response.data });
  }).catch(() => {
    // Purely informational, a failure here must not break the list.
  });

const PAGE_LIMIT = 40;

// The API paginates scheduled statuses by id descending — that is, by creation
// order — while a queue has to be shown by publication time. The soonest post can
// therefore sit on any page, so the whole queue is pulled in before rendering.
// That is cheap: an account may hold at most ScheduledStatus::TOTAL_LIMIT records
// (300 by default), so this is one request in practice and eight at the cap.
//
// The cap below keeps an instance that raised TOTAL_LIMIT far higher from turning
// this into an unbounded request loop; whatever is left stays reachable through
// the usual "load more" cursor.
const MAX_AUTO_PAGES = 10;

const nextLinkOf = response => getLinks(response).refs.find(link => link.rel === 'next')?.uri ?? null;

export const fetchScheduledStatuses = () => async (dispatch) => {
  dispatch({ type: SCHEDULED_STATUSES_FETCH_REQUEST });

  try {
    const collected = [];
    let url = '/api/v1/scheduled_statuses';
    let config = { params: { limit: PAGE_LIMIT } };
    let remaining = null;

    for (let page = 0; page < MAX_AUTO_PAGES; page += 1) {
      const response = await api().get(url, config);

      recordServerClockSkew(response.headers?.date);
      collected.push(...response.data);

      remaining = nextLinkOf(response);

      if (!remaining) {
        break;
      }

      // Subsequent pages come from the Link header, which is already a full URL.
      url = remaining;
      config = undefined;
    }

    dispatch({
      type: SCHEDULED_STATUSES_FETCH_SUCCESS,
      scheduledStatuses: collected,
      next: remaining,
    });

    dispatch(fetchScheduledStatusesUsage());
  } catch (error) {
    dispatch({ type: SCHEDULED_STATUSES_FETCH_FAIL, error });
    dispatch(showAlertForError(error));
  }
};

export const expandScheduledStatuses = () => (dispatch, getState) => {
  const next = getState().getIn(['scheduled_statuses', 'next']);
  const isLoading = getState().getIn(['scheduled_statuses', 'isLoading']);

  if (!next || isLoading) {
    return Promise.resolve();
  }

  dispatch({ type: SCHEDULED_STATUSES_EXPAND_REQUEST });

  return api().get(next).then(response => {
    dispatch({
      type: SCHEDULED_STATUSES_EXPAND_SUCCESS,
      scheduledStatuses: response.data,
      next: nextLinkOf(response),
    });
  }).catch(error => {
    dispatch({ type: SCHEDULED_STATUSES_EXPAND_FAIL, error });
    dispatch(showAlertForError(error));
  });
};

// Background check for a single record whose publication time has arrived: it
// either comes back carrying a failure, or it is gone because it published.
// Cheaper than re-pulling the whole queue on every tick, and it says nothing to
// the user — disappearing is the expected, successful outcome here.
export const verifyScheduledStatus = id => (dispatch) =>
  api().get(`/api/v1/scheduled_statuses/${id}`).then(({ data }) => {
    dispatch(upsertScheduledStatus(data));
  }).catch(error => {
    if (error.response?.status === 404) {
      dispatch(removeScheduledStatus(id));
      dispatch(fetchScheduledStatusesUsage());
    }
  });

// `params` accepts `scheduled_at` alone (move in time) or the full set of
// content keys, matching PUT /api/v1/scheduled_statuses/:id.
// A 404 here is not a real error: the post published (or was removed elsewhere)
// in the moments before the request. Drop the row, but say what happened —
// letting it vanish silently reads as "deleted", which is the opposite of true.
const handleMissingRecord = (dispatch, id, error) => {
  if (error.response?.status !== 404) {
    return false;
  }

  dispatch(removeScheduledStatus(id));
  dispatch(showAlert({ message: messages.gone }));
  dispatch(fetchScheduledStatusesUsage());
  return true;
};

export const updateScheduledStatus = (id, params) => (dispatch) =>
  api().put(`/api/v1/scheduled_statuses/${id}`, params).then(({ data }) => {
    dispatch(upsertScheduledStatus(data));
    dispatch(fetchScheduledStatusesUsage());
    return data;
  }).catch(error => {
    if (!handleMissingRecord(dispatch, id, error)) {
      dispatch(showAlertForError(error));
    }

    throw error;
  });

export const deleteScheduledStatus = id => (dispatch) =>
  api().delete(`/api/v1/scheduled_statuses/${id}`).then(() => {
    dispatch(removeScheduledStatus(id));
    dispatch(fetchScheduledStatusesUsage());
  }).catch(error => {
    if (handleMissingRecord(dispatch, id, error)) {
      return;
    }

    dispatch(showAlertForError(error));
    throw error;
  });
