import { makeStore } from './index';
import { sessionEnded, sessionStarted } from './auth-slice';
import {
  mineToggled,
  pageChanged,
  searchChanged,
  statusChanged,
  tagToggled,
} from './catalog-slice';

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
  it('clears the filters when the user logs out', () => {
    const store = makeStore();
    store.dispatch(sessionStarted({ accessToken: 'jwt', user }));
    store.dispatch(searchChanged('weather'));
    store.dispatch(tagToggled('maps'));
    store.dispatch(statusChanged('draft'));
    store.dispatch(mineToggled());

    store.dispatch(sessionEnded());

    expect(store.getState().catalog).toEqual({
      q: '',
      tags: [],
      status: '',
      page: 1,
      mine: false,
    });
  });

  it('allows several tags at once, and clicking a selected tag removes it', () => {
    const store = makeStore();

    store.dispatch(tagToggled('geo'));
    store.dispatch(tagToggled('maps'));
    expect(store.getState().catalog.tags).toEqual(['geo', 'maps']);

    store.dispatch(tagToggled('geo'));
    expect(store.getState().catalog.tags).toEqual(['maps']);
  });

  it('goes back to page 1 when the search changes', () => {
    const store = makeStore();
    store.dispatch(pageChanged(3));

    store.dispatch(searchChanged('weather'));

    expect(store.getState().catalog).toMatchObject({ q: 'weather', page: 1 });
  });
});
