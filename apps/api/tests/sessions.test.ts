import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { createUser } from './helpers/users';

const app = createApp();

beforeAll(requireTestDatabase);
beforeEach(resetPostgres);
afterAll(() => prisma.$disconnect());

/** Returns the raw refresh cookie value from a response, or undefined. */
function refreshCookie(res: request.Response) {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('ams_refresh='));
  return cookie ? { header: cookie, value: cookie.split(';')[0]!.split('=')[1]! } : undefined;
}

async function login() {
  const { user, password } = await createUser();
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  return { user, res, cookie: refreshCookie(res)! };
}

function refresh(value: string) {
  return request(app).post('/api/v1/auth/refresh').set('Cookie', `ams_refresh=${value}`);
}

describe('refresh cookie', () => {
  it('is set on login with safe attributes and stored only as a hash', async () => {
    const { cookie } = await login();

    expect(cookie.header).toMatch(/HttpOnly/i);
    expect(cookie.header).toMatch(/SameSite=Strict/i);
    expect(cookie.header).toMatch(/Path=\/api\/v1\/auth/i);
    expect(await prisma.refreshToken.count({ where: { tokenHash: cookie.value } })).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(1);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new access token and rotates the cookie', async () => {
    const { user, cookie } = await login();

    const res = await refresh(cookie.value);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(typeof res.body.data.accessToken).toBe('string');
    const next = refreshCookie(res)!;
    expect(next.value).not.toBe(cookie.value);
    expect((await refresh(next.value)).status).toBe(200);
  });

  it('treats a reused token as theft and ends the whole login', async () => {
    const { cookie } = await login();
    const next = refreshCookie(await refresh(cookie.value))!;

    const reuse = await refresh(cookie.value);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    // The newer token, possibly held by an attacker, no longer works either.
    expect((await refresh(next.value)).status).toBe(401);
  });

  it('lets only one of two simultaneous refreshes with the same token succeed', async () => {
    const { cookie } = await login();

    const results = await Promise.all([refresh(cookie.value), refresh(cookie.value)]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('does not affect other logins of the same user', async () => {
    const { user, password } = await createUser();
    const first = refreshCookie(
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password })
    )!;
    const second = refreshCookie(
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password })
    )!;

    await refresh(first.value);
    await refresh(first.value); // reuse ends the first login only

    expect((await refresh(second.value)).status).toBe(200);
  });

  it('rejects an expired token', async () => {
    const { cookie } = await login();
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await refresh(cookie.value);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('rejects a missing or unknown token and clears the cookie', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);

    const res = await refresh('not-a-real-token');

    expect(res.status).toBe(401);
    expect(refreshCookie(res)?.header).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('ends the login so the refresh token stops working', async () => {
    const { cookie } = await login();

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `ams_refresh=${cookie.value}`);

    expect(res.status).toBe(204);
    expect((await refresh(cookie.value)).status).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
  });
});
