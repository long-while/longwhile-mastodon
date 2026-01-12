import { createAction } from '@reduxjs/toolkit';

export const openNavigation = createAction('NAVIGATION_OPEN');
export const closeNavigation = createAction('NAVIGATION_CLOSE');
export const toggleNavigation = createAction('NAVIGATION_TOGGLE');

