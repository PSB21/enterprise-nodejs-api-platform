import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { authSlice } from './auth-slice';
import { catalogSlice } from './catalog-slice';

/**
 * Redux holds client state only: the session and UI choices such as catalog filters.
 * Data from the server (APIs, requests, keys, usage) is cached by React Query instead,
 * which also handles loading states, refetching and invalidation.
 */
export function makeStore() {
  return configureStore({
    reducer: { auth: authSlice.reducer, catalog: catalogSlice.reducer },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** The app's single store. Tests create their own with makeStore(). */
export const store = makeStore();
