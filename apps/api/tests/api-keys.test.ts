import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { sha256 } from '../src/lib/hash';
import { AccessRequestModel } from '../src/modules/access-requests/access-request.model';
import { ApiKeyModel } from '../src/modules/api-keys/api-key.model';
import { MAX_ACTIVE_KEYS } from '../src/modules/api-keys/api-key.service';
import { approveAccess, issueKey } from './helpers/access';
import { createApi } from './helpers/apis';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { resetMongo, setupMongo, teardownMongo } from './helpers/mongo';
import { authed, createUser } from './helpers/users';

const app = createApp();

beforeAll(async () => {
  requireTestDatabase();
  await setupMongo();
});
beforeEach(async () => {
  await Promise.all([resetPostgres(), resetMongo()]);
});
afterAll(async () => {
  await Promise.all([prisma.$disconnect(), teardownMongo()]);
});

async function baseScenario() {
  const publisher = await createUser('PUBLISHER');
  const dev = await createUser('DEVELOPER');
  const api = await createApi(publisher.user.id);
  return { publisher, dev, api };
}

async function approvedScenario() {
  const publisher = await createUser('PUBLISHER');
  const dev = await createUser('DEVELOPER');
  const api = await createApi(publisher.user.id);
  const request = await approveAccess(api, dev.user.id, 'Pro');
  return { publisher, dev, api, request };
}

describe('POST /api/v1/api-keys', () => {
  it('returns the full key once and stores only its hash', async () => {
    const { dev, api, request } = await approvedScenario();

    const res = await authed(app, dev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: request.id, name: 'Production' });

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { key, apiKey } = res.body.data;
    expect(key).toMatch(/^ams_[A-Za-z0-9_-]{43}$/);
    expect(apiKey).toMatchObject({ name: 'Production', planName: 'Pro', prefix: key.slice(0, 12) });
    expect(apiKey.api.name).toBe(api.name);

    const stored = await ApiKeyModel.findById(apiKey.id).lean();
    expect(stored!.keyHash).toBe(sha256(key));
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it('never shows the full key again', async () => {
    const { dev, request } = await approvedScenario();
    const created = await authed(app, dev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: request.id });

    const list = await authed(app, dev.token).get('/api/v1/api-keys');

    expect(JSON.stringify(list.body)).not.toContain(created.body.data.key);
    expect(list.body.data[0].prefix).toBe(created.body.data.apiKey.prefix);
  });

  it('refuses keys for a request that is not approved', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const api = await createApi(publisher.user.id);
    const pending = await AccessRequestModel.create({
      apiId: api._id,
      apiOwnerId: api.ownerId,
      developerId: dev.user.id,
      planName: 'Free',
      useCase: 'Waiting for approval still.',
    });

    const res = await authed(app, dev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: pending.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCESS_NOT_APPROVED');
  });

  it("refuses keys for someone else's request", async () => {
    const { request } = await approvedScenario();
    const otherDev = await createUser('DEVELOPER');

    const res = await authed(app, otherDev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: request.id });

    expect(res.status).toBe(404);
  });

  it(`allows at most ${MAX_ACTIVE_KEYS} active keys per request`, async () => {
    const { dev, request } = await approvedScenario();
    for (let i = 0; i < MAX_ACTIVE_KEYS; i += 1) {
      await authed(app, dev.token).post('/api/v1/api-keys').send({ accessRequestId: request.id });
    }

    const res = await authed(app, dev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: request.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('KEY_LIMIT_REACHED');
  });
});

describe('DELETE /api/v1/api-keys/:id', () => {
  it('revokes a key, and revoking again is harmless', async () => {
    const { dev, api } = await baseScenario();
    const { apiKey } = await issueKey(api, dev.user.id);

    const first = await authed(app, dev.token).delete(`/api/v1/api-keys/${apiKey.id}`);
    const second = await authed(app, dev.token).delete(`/api/v1/api-keys/${apiKey.id}`);

    expect(first.status).toBe(200);
    expect(first.body.data.revokedAt).not.toBeNull();
    expect(second.body.data.revokedAt).toBe(first.body.data.revokedAt);
    expect((await authed(app, dev.token).get('/api/v1/api-keys')).body.meta.total).toBe(0);
  });

  it("returns 404 for another developer's key", async () => {
    const { dev, api } = await baseScenario();
    const { apiKey } = await issueKey(api, dev.user.id);
    const otherDev = await createUser('DEVELOPER');

    const res = await authed(app, otherDev.token).delete(`/api/v1/api-keys/${apiKey.id}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/access-requests/:id/revoke', () => {
  it('revokes the access and every key it issued, and notifies the developer', async () => {
    const { publisher, dev, api } = await baseScenario();
    const { request } = await issueKey(api, dev.user.id);

    const res = await authed(app, publisher.token)
      .post(`/api/v1/access-requests/${request.id}/revoke`)
      .send({ note: 'Terms of use violated' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('revoked');
    expect(await ApiKeyModel.countDocuments({ revokedAt: null })).toBe(0);
    const inbox = await authed(app, dev.token).get('/api/v1/notifications');
    expect(inbox.body.data[0].type).toBe('access-request.revoked');
  });

  it('only revokes approved access', async () => {
    const { publisher, dev, api } = await baseScenario();
    const pending = await AccessRequestModel.create({
      apiId: api._id,
      apiOwnerId: api.ownerId,
      developerId: dev.user.id,
      planName: 'Free',
      useCase: 'Not approved yet at all.',
      active: false,
      status: 'rejected',
    });

    const res = await authed(app, publisher.token)
      .post(`/api/v1/access-requests/${pending.id}/revoke`)
      .send({ note: 'Cleaning up' });

    expect(res.status).toBe(409);
  });
});
