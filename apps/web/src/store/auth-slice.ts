import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Session, User } from '@/lib/types';

/**
 * Who is logged in. The access token lives only here, in memory, never in localStorage: a
 * cross-site scripting bug could read localStorage, but not this. After a page reload it is
 * gone, and the httpOnly refresh cookie is used to get a new one.
 */
export interface AuthState {
  // 'checking' while the app asks the API whether a refresh cookie still works.
  status: 'checking' | 'authenticated' | 'anonymous';
  accessToken: string | null;
  user: User | null;
}

const initialState: AuthState = { status: 'checking', accessToken: null, user: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<Session>) {
      state.status = 'authenticated';
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
    },
    sessionEnded(state) {
      state.status = 'anonymous';
      state.accessToken = null;
      state.user = null;
    },
  },
});

export const { sessionStarted, sessionEnded } = authSlice.actions;
