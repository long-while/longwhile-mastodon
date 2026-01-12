import type { Store } from 'redux';

import { RESET_ALL } from '../actions/store';

export const resetStore = (store: Store) => {
  store.dispatch({ type: RESET_ALL });
};

