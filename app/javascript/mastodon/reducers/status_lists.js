import { Map as ImmutableMap, OrderedSet as ImmutableOrderedSet } from 'immutable';

import {
  blockAccountSuccess,
  muteAccountSuccess,
} from '../actions/accounts';
import {
  deleteBookmarkFolder,
  setStatusBookmarkFolders,
} from '../actions/bookmark_folders';
import {
  UNSORTED_FOLDER_ID,
  addStatusesToBookmarkFolder,
  fetchBookmarkList,
  bookmarkListKey,
  parseBookmarkListKey,
  removeBookmarks,
  removeStatusesFromBookmarkFolder,
} from '../actions/bookmark_list';
import {
  BOOKMARKED_STATUSES_FETCH_REQUEST,
  BOOKMARKED_STATUSES_FETCH_SUCCESS,
  BOOKMARKED_STATUSES_FETCH_FAIL,
  BOOKMARKED_STATUSES_EXPAND_REQUEST,
  BOOKMARKED_STATUSES_EXPAND_SUCCESS,
  BOOKMARKED_STATUSES_EXPAND_FAIL,
} from '../actions/bookmarks';
import {
  FAVOURITED_STATUSES_FETCH_REQUEST,
  FAVOURITED_STATUSES_FETCH_SUCCESS,
  FAVOURITED_STATUSES_FETCH_FAIL,
  FAVOURITED_STATUSES_EXPAND_REQUEST,
  FAVOURITED_STATUSES_EXPAND_SUCCESS,
  FAVOURITED_STATUSES_EXPAND_FAIL,
} from '../actions/favourites';
import {
  FAVOURITE_SUCCESS,
  UNFAVOURITE_SUCCESS,
  BOOKMARK_SUCCESS,
  UNBOOKMARK_SUCCESS,
  PIN_SUCCESS,
  UNPIN_SUCCESS,
} from '../actions/interactions';
import {
  PINNED_STATUSES_FETCH_SUCCESS,
} from '../actions/pin_statuses';
import {
  TRENDS_STATUSES_FETCH_REQUEST,
  TRENDS_STATUSES_FETCH_SUCCESS,
  TRENDS_STATUSES_FETCH_FAIL,
  TRENDS_STATUSES_EXPAND_REQUEST,
  TRENDS_STATUSES_EXPAND_SUCCESS,
  TRENDS_STATUSES_EXPAND_FAIL,
} from '../actions/trends';



const initialState = ImmutableMap({
  favourites: ImmutableMap({
    next: null,
    loaded: false,
    items: ImmutableOrderedSet(),
  }),
  bookmarks: ImmutableMap({
    next: null,
    loaded: false,
    items: ImmutableOrderedSet(),
  }),
  pins: ImmutableMap({
    next: null,
    loaded: false,
    items: ImmutableOrderedSet(),
  }),
  trending: ImmutableMap({
    next: null,
    loaded: false,
    items: ImmutableOrderedSet(),
  }),
});

const normalizeList = (state, listType, statuses, next) => {
  return state.update(listType, listMap => listMap.withMutations(map => {
    map.set('next', next);
    map.set('loaded', true);
    map.set('isLoading', false);
    map.set('items', ImmutableOrderedSet(statuses.map(item => item.id)));
  }));
};

const appendToList = (state, listType, statuses, next) => {
  return state.update(listType, listMap => listMap.withMutations(map => {
    map.set('next', next);
    map.set('isLoading', false);
    map.set('items', map.get('items').union(statuses.map(item => item.id)));
  }));
};

const prependOneToList = (state, listType, status) => {
  return state.updateIn([listType, 'items'], (list) => {
    if (list.includes(status.get('id'))) {
      return list;
    } else {
      return ImmutableOrderedSet([status.get('id')]).union(list);
    }
  });
};

const removeOneFromList = (state, listType, status) => {
  return state.updateIn([listType, 'items'], (list) => list.delete(status.get('id')));
};

const emptyList = () => ImmutableMap({
  next: null,
  loaded: false,
  isLoading: false,
  items: ImmutableOrderedSet(),
});

const bookmarkListKeys = (state) => state.keySeq().filter((key) => parseBookmarkListKey(key) !== null).toArray();

const keysInScope = (state, scope) =>
  bookmarkListKeys(state).filter((key) => parseBookmarkListKey(key).scope === scope);

const deleteKeys = (state, keys) => keys.reduce((acc, key) => acc.delete(key), state);

const removeIds = (state, keys, statusIds) =>
  keys.reduce((acc, key) => acc.updateIn([key, 'items'], (items) => items.subtract(statusIds)), state);

const invalidateUnlessContains = (state, keys, statusIds) =>
  keys.reduce((acc, key) => {
    const items = acc.getIn([key, 'items']);
    return statusIds.every((id) => items.has(id)) ? acc : acc.delete(key);
  }, state);

const applyStatusFolders = (state, statusId, folderIds) => {
  const wanted = new Set(folderIds);

  return bookmarkListKeys(state).reduce((acc, key) => {
    const { scope } = parseBookmarkListKey(key);

    if (scope === 'all') return acc;

    const belongs = scope === UNSORTED_FOLDER_ID ? wanted.size === 0 : wanted.has(scope);

    if (!belongs) return removeIds(acc, [key], [statusId]);

    return invalidateUnlessContains(acc, [key], [statusId]);
  }, state);
};

const addToFolder = (state, folderId, statusIds) => {
  const withFolder = invalidateUnlessContains(state, keysInScope(state, folderId), statusIds);
  return removeIds(withFolder, keysInScope(withFolder, UNSORTED_FOLDER_ID), statusIds);
};

const removeFromFolder = (state, folderId, statusIds) => {
  const withoutIds = removeIds(state, keysInScope(state, folderId), statusIds);
  return deleteKeys(withoutIds, keysInScope(withoutIds, UNSORTED_FOLDER_ID));
};

const removeFromAllBookmarkLists = (state, statusIds) =>
  removeIds(state, bookmarkListKeys(state), statusIds);

const fetchedList = (state, action) => {
  const { key, statusIds, next, append } = action.payload;
  const list = state.get(key);

  if (!list) return state;
  if (!append && list.get('requestId') !== action.meta.requestId) return state;

  const statuses = statusIds.map((id) => ({ id }));

  return append ? appendToList(state, key, statuses, next) : normalizeList(state, key, statuses, next);
};

const startedList = (state, action) => {
  const key = bookmarkListKey(action.meta.arg.query);

  return state.update(key, (list) => {
    const base = (list ?? emptyList()).set('isLoading', true);
    return action.meta.arg.url ? base : base.set('requestId', action.meta.requestId);
  });
};

const bookmarkLists = (state, action) => {
  if (fetchBookmarkList.pending.match(action)) return startedList(state, action);

  if (fetchBookmarkList.rejected.match(action)) {
    const key = bookmarkListKey(action.meta.arg.query);
    return state.has(key) ? state.setIn([key, 'isLoading'], false) : state;
  }

  if (fetchBookmarkList.fulfilled.match(action)) return fetchedList(state, action);

  if (setStatusBookmarkFolders.fulfilled.match(action)) {
    return applyStatusFolders(state, action.payload.statusId, action.payload.folderIds);
  }

  if (addStatusesToBookmarkFolder.fulfilled.match(action)) {
    return addToFolder(state, action.payload.folderId, action.payload.statusIds);
  }

  if (removeStatusesFromBookmarkFolder.fulfilled.match(action)) {
    return removeFromFolder(state, action.payload.folderId, action.payload.statusIds);
  }

  if (removeBookmarks.fulfilled.match(action)) {
    return removeFromAllBookmarkLists(state, action.payload.statusIds);
  }

  if (deleteBookmarkFolder.fulfilled.match(action)) {
    return deleteKeys(state, [...keysInScope(state, action.payload.id), ...keysInScope(state, UNSORTED_FOLDER_ID)]);
  }

  return null;
};

const prependNewBookmark = (state, status) => {
  const withMain = prependOneToList(state, 'bookmarks', status);
  const unsortedKey = bookmarkListKey({ folderId: UNSORTED_FOLDER_ID });

  return withMain.has(unsortedKey) ? prependOneToList(withMain, unsortedKey, status) : withMain;
};

/** @type {import('@reduxjs/toolkit').Reducer<typeof initialState>} */
export default function statusLists(state = initialState, action) {
  const bookmarkState = bookmarkLists(state, action);

  if (bookmarkState !== null) {
    return bookmarkState;
  }

  switch(action.type) {
  case FAVOURITED_STATUSES_FETCH_REQUEST:
  case FAVOURITED_STATUSES_EXPAND_REQUEST:
    return state.setIn(['favourites', 'isLoading'], true);
  case FAVOURITED_STATUSES_FETCH_FAIL:
  case FAVOURITED_STATUSES_EXPAND_FAIL:
    return state.setIn(['favourites', 'isLoading'], false);
  case FAVOURITED_STATUSES_FETCH_SUCCESS:
    return normalizeList(state, 'favourites', action.statuses, action.next);
  case FAVOURITED_STATUSES_EXPAND_SUCCESS:
    return appendToList(state, 'favourites', action.statuses, action.next);
  case BOOKMARKED_STATUSES_FETCH_REQUEST:
  case BOOKMARKED_STATUSES_EXPAND_REQUEST:
    return state.setIn(['bookmarks', 'isLoading'], true);
  case BOOKMARKED_STATUSES_FETCH_FAIL:
  case BOOKMARKED_STATUSES_EXPAND_FAIL:
    return state.setIn(['bookmarks', 'isLoading'], false);
  case BOOKMARKED_STATUSES_FETCH_SUCCESS:
    return normalizeList(state, 'bookmarks', action.statuses, action.next);
  case BOOKMARKED_STATUSES_EXPAND_SUCCESS:
    return appendToList(state, 'bookmarks', action.statuses, action.next);
  case TRENDS_STATUSES_FETCH_REQUEST:
  case TRENDS_STATUSES_EXPAND_REQUEST:
    return state.setIn(['trending', 'isLoading'], true);
  case TRENDS_STATUSES_FETCH_FAIL:
  case TRENDS_STATUSES_EXPAND_FAIL:
    return state.setIn(['trending', 'isLoading'], false);
  case TRENDS_STATUSES_FETCH_SUCCESS:
    return normalizeList(state, 'trending', action.statuses, action.next);
  case TRENDS_STATUSES_EXPAND_SUCCESS:
    return appendToList(state, 'trending', action.statuses, action.next);
  case FAVOURITE_SUCCESS:
    return prependOneToList(state, 'favourites', action.status);
  case UNFAVOURITE_SUCCESS:
    return removeOneFromList(state, 'favourites', action.status);
  case BOOKMARK_SUCCESS:
    return prependNewBookmark(state, action.status);
  case UNBOOKMARK_SUCCESS:
    return removeFromAllBookmarkLists(state, [action.status.get('id')]);
  case PINNED_STATUSES_FETCH_SUCCESS:
    return normalizeList(state, 'pins', action.statuses, action.next);
  case PIN_SUCCESS:
    return prependOneToList(state, 'pins', action.status);
  case UNPIN_SUCCESS:
    return removeOneFromList(state, 'pins', action.status);
  case blockAccountSuccess.type:
  case muteAccountSuccess.type:
    return state.updateIn(['trending', 'items'], ImmutableOrderedSet(), list => list.filterNot(statusId => action.payload.statuses.getIn([statusId, 'account']) === action.payload.relationship.id));
  default:
    return state;
  }
}
