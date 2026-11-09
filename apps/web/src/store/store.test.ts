import { makeStore } from './index';
import { sessionEnded, sessionStarted } from './auth-slice';
import { pageChanged, searchChanged } from './catalog-slice';

const user = {
  id: 'u1',
  name: 'Asha',
  email: 'asha@example.com',
  role: 'DEVELOPER' as const,
  createdAt: '2026-11-01T00:00:00Z',
};

describe('auth slice', () => {
  it('starts by checking for an existing session', () => {
    expect(makeStore().getState().auth.status).toBe('checking');
  });

  it('stores the session, and clears it on logout', () => {
    const store = makeStore();

    store.dispatch(sessionStarted({ accessToken: 'jwt', user }));
    expect(store.getState().auth).toEqual({ status: 'authenticated', accessToken: 'jwt', user });

    store.dispatch(sessionEnded());
    expect(store.getState().auth).toEqual({ status: 'anonymous', accessToken: null, user: null });
  });
});

describe('catalog slice', () => {
  it('goes back to page 1 when the search changes', () => {
    const store = makeStore();
    store.dispatch(pageChanged(3));

    store.dispatch(searchChanged('weather'));

    expect(store.getState().catalog).toMatchObject({ q: 'weather', page: 1 });
  });
});
