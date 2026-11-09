import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { issueRefreshToken } from '../src/modules/auth/refresh-token';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { authed, createUser } from './helpers/users';

const app = createApp();

beforeAll(requireTestDatabase);
beforeEach(resetPostgres);
afterAll(() => prisma.$disconnect());

describe('GET /api/v1/users', () => {
  it('lists users for an admin, with paging and without password hashes', async () => {
    const admin = await createUser('ADMIN');
    await createUser('DEVELOPER');
    await createUser('PUBLISHER');

    const res = await authed(app, admin.token).get('/api/v1/users?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('filters by role', async () => {
    const admin = await createUser('ADMIN');
    await createUser('PUBLISHER');

    const res = await authed(app, admin.token).get('/api/v1/users?role=PUBLISHER');

    expect(res.body.data.map((u: { role: string }) => u.role)).toEqual(['PUBLISHER']);
  });

  it.each(['DEVELOPER', 'PUBLISHER'] as const)('returns 403 for a %s', async (role) => {
    const { token } = await createUser(role);

    const res = await authed(app, token).get('/api/v1/users');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 without a token', async () => {
    expect((await request(app).get('/api/v1/users')).status).toBe(401);
  });

  it('rejects an out-of-range limit', async () => {
    const admin = await createUser('ADMIN');

    expect((await authed(app, admin.token).get('/api/v1/users?limit=1000')).status).toBe(400);
  });
});

describe('PATCH /api/v1/users/:id/role', () => {
  it("changes a user's role and ends their sessions", async () => {
    const admin = await createUser('ADMIN');
    const dev = await createUser('DEVELOPER');
    await issueRefreshToken(dev.user.id);

    const res = await authed(app, admin.token)
      .patch(`/api/v1/users/${dev.user.id}/role`)
      .send({ role: 'PUBLISHER' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('PUBLISHER');
    expect(
      await prisma.refreshToken.count({ where: { userId: dev.user.id, revokedAt: null } })
    ).toBe(0);
  });

  it('stops an admin from changing their own role', async () => {
    const admin = await createUser('ADMIN');

    const res = await authed(app, admin.token)
      .patch(`/api/v1/users/${admin.user.id}/role`)
      .send({ role: 'DEVELOPER' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('returns 404 for an unknown user and 400 for an unknown role', async () => {
    const admin = await createUser('ADMIN');
    const dev = await createUser();

    const missing = await authed(app, admin.token)
      .patch('/api/v1/users/00000000-0000-4000-8000-000000000000/role')
      .send({ role: 'ADMIN' });
    const badRole = await authed(app, admin.token)
      .patch(`/api/v1/users/${dev.user.id}/role`)
      .send({ role: 'OWNER' });

    expect(missing.status).toBe(404);
    expect(badRole.status).toBe(400);
  });

  it('cannot be used by a developer to promote themselves', async () => {
    const dev = await createUser('DEVELOPER');

    const res = await authed(app, dev.token)
      .patch(`/api/v1/users/${dev.user.id}/role`)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dev.user.id } })).role).toBe(
      'DEVELOPER'
    );
  });
});
