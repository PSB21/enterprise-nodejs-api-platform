import axios from 'axios';

import { store } from '@/store';
import { sessionEnded, sessionStarted } from '@/store/auth-slice';
import { createApiClient } from './api-client';
import type { Session } from './types';

// The auth endpoints are called with a plain Axios instance, outside the client below, so a
// failed refresh can never trigger another refresh.
const auth = axios.create({ baseURL: '/api/v1/auth' });

let inFlight: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Calls made while one is in
 * progress share it. That matters in development, where React runs effects twice: two
 * refreshes with the same cookie would look like token theft to the server.
 */
export function refreshSession(): Promise<string | null> {
  inFlight ??= auth
    .post<{ data: Session }>('/refresh')
    .then(({ data }) => {
      store.dispatch(sessionStarted(data.data));
      return data.data.accessToken;
    })
    .catch(() => {
      store.dispatch(sessionEnded());
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function login(email: string, password: string) {
  const { data } = await auth.post<{ data: Session }>('/login', { email, password });
  store.dispatch(sessionStarted(data.data));
  return data.data.user;
}

export async function register(name: string, email: string, password: string) {
  await auth.post('/register', { name, email, password });
  return login(email, password);
}

export async function logout() {
  try {
    await auth.post('/logout');
  } finally {
    store.dispatch(sessionEnded());
  }
}

/** The client every page uses to call the API. */
export const api = createApiClient({
  getAccessToken: () => store.getState().auth.accessToken,
  refresh: refreshSession,
  onSessionExpired: () => store.dispatch(sessionEnded()),
});
