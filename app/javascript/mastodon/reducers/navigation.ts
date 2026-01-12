import { createReducer } from '@reduxjs/toolkit';

import { closeNavigation, openNavigation, toggleNavigation } from '../actions/navigation';

export interface NavigationState {
  open: boolean;
}

const initialState: NavigationState = {
  open: false,
};

export const navigationReducer = createReducer(initialState, builder => {
  builder
    .addCase(openNavigation, (state) => {
      state.open = true;
    })
    .addCase(closeNavigation, (state) => {
      state.open = false;
    })
    .addCase(toggleNavigation, (state) => {
      state.open = !state.open;
    });
});

