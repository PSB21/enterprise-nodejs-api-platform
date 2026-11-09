import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { AccessRequestModel } from '../src/modules/access-requests/access-request.model';
import { NotificationModel } from '../src/modules/notifications/notification.model';
import { createApi } from './helpers/apis';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { resetMongo, setupMongo, teardownMongo } from './helpers/mongo';
import { authed, createUser } from './helpers/users';

const app = createApp();
const base = '/api/v1/access-requests';

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

async function scenario() {
  const publisher = await createUser('PUBLISHER');
  const dev = await createUser('DEVELOPER');
  const api = await createApi(publisher.user.id);
  return { publisher, dev, api };
}

function requestAccess(token: string, api: string, planName = 'Free') {
  return authed(app, token)
    .post(base)
    .send({ api, planName, useCase: 'Show the forecast in our delivery app.' });
}

describe('POST /api/v1/access-requests', () => {
  it('creates a pending request with a history entry', async () => {
    const { dev, api } = await scenario();

    const res = await requestAccess(dev.token, api.slug, 'pro');

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      planName: 'Pro',
      developerId: dev.user.id,
      api: { id: api.id, slug: api.slug },
    });
    expect(res.body.data.history).toHaveLength(1);
  });

  it('allows only one active request per API, even when sent twice at once', async () => {
    const { dev, api } = await scenario();

    const results = await Promise.all([
      requestAccess(dev.token, api.slug),
      requestAccess(dev.token, api.slug),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await AccessRequestModel.countDocuments()).toBe(1);
  });

  it('allows a new request after a rejection', async () => {
    const { publisher, dev, api } = await scenario();
    const first = await requestAccess(dev.token, api.slug);
    await authed(app, publisher.token)
      .post(`${base}/${first.body.data.id}/reject`)
      .send({ note: 'Please describe the use case in more detail.' });

    const second = await requestAccess(dev.token, api.slug);

    expect(second.status).toBe(201);
  });

  it('rejects an unknown plan, a draft API and non-developers', async () => {
    const { publisher, dev, api } = await scenario();
    const draft = await createApi(publisher.user.id, { status: 'draft' });

    expect((await requestAccess(dev.token, api.slug, 'Enterprise')).body.error.code).toBe(
      'PLAN_NOT_FOUND'
    );
    expect((await requestAccess(dev.token, draft.slug)).status).toBe(404);
    expect((await requestAccess(publisher.token, api.slug)).status).toBe(403);
  });
});

describe('reviewing requests', () => {
  it('approves a request and notifies the developer', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);

    const res = await authed(app, publisher.token)
      .post(`${base}/${created.body.data.id}/approve`)
      .send({ note: 'Welcome aboard' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.history.map((h: { status: string }) => h.status)).toEqual([
      'pending',
      'approved',
    ]);

    const inbox = await authed(app, dev.token).get('/api/v1/notifications');
    expect(inbox.body.meta.unread).toBe(1);
    expect(inbox.body.data[0]).toMatchObject({ type: 'access-request.approved' });
    expect(inbox.body.data[0].message).toContain(api.name);
  });

  it('saves nothing if the notification cannot be written (transaction rollback)', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = jest
      .spyOn(NotificationModel, 'create')
      .mockRejectedValueOnce(new Error('disk full') as never);

    const res = await authed(app, publisher.token)
      .post(`${base}/${created.body.data.id}/approve`)
      .send({});

    expect(res.status).toBe(500);
    const stored = await AccessRequestModel.findById(created.body.data.id);
    expect(stored!.status).toBe('pending');
    expect(stored!.history).toHaveLength(1);
    failing.mockRestore();
    logged.mockRestore();
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);
    const id = created.body.data.id;

    const results = await Promise.all([
      authed(app, publisher.token).post(`${base}/${id}/approve`).send({}),
      authed(app, publisher.token).post(`${base}/${id}/reject`).send({ note: 'No thanks' }),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await NotificationModel.countDocuments()).toBe(1);
  });

  it('cannot decide a request twice', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);
    const id = created.body.data.id;
    await authed(app, publisher.token).post(`${base}/${id}/approve`).send({});

    const again = await authed(app, publisher.token)
      .post(`${base}/${id}/reject`)
      .send({ note: 'Changed my mind' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS');
  });

  it('requires a note to reject', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);

    const res = await authed(app, publisher.token)
      .post(`${base}/${created.body.data.id}/reject`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 when a publisher reviews another publisher's request", async () => {
    const { dev, api } = await scenario();
    const otherPublisher = await createUser('PUBLISHER');
    const created = await requestAccess(dev.token, api.slug);

    const res = await authed(app, otherPublisher.token)
      .post(`${base}/${created.body.data.id}/approve`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('stops a developer from approving their own request', async () => {
    const { dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);

    const res = await authed(app, dev.token)
      .post(`${base}/${created.body.data.id}/approve`)
      .send({});

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/access-requests', () => {
  it("shows each role the right requests: own, own APIs', or all", async () => {
    const { publisher, dev, api } = await scenario();
    const other = await scenario();
    const admin = await createUser('ADMIN');
    await requestAccess(dev.token, api.slug);
    await requestAccess(other.dev.token, other.api.slug);

    const asDev = await authed(app, dev.token).get(base);
    const asPublisher = await authed(app, publisher.token).get(base);
    const asAdmin = await authed(app, admin.token).get(base);

    expect(asDev.body.data.map((r: { developerId: string }) => r.developerId)).toEqual([
      dev.user.id,
    ]);
    expect(asPublisher.body.data.map((r: { api: { id: string } }) => r.api.id)).toEqual([api.id]);
    expect(asAdmin.body.meta.total).toBe(2);
    expect(asDev.body.data[0].api.name).toBe(api.name);
    expect(asPublisher.body.data[0].developer).toEqual({
      id: dev.user.id,
      name: dev.user.name,
      email: dev.user.email,
    });
  });

  it('filters by status', async () => {
    const { publisher, dev, api } = await scenario();
    await requestAccess(dev.token, api.slug);

    const pending = await authed(app, publisher.token).get(`${base}?status=pending`);
    const approved = await authed(app, publisher.token).get(`${base}?status=approved`);

    expect(pending.body.meta.total).toBe(1);
    expect(approved.body.meta.total).toBe(0);
  });
});

describe('notifications', () => {
  it('can be marked as read, but only by their owner', async () => {
    const { publisher, dev, api } = await scenario();
    const created = await requestAccess(dev.token, api.slug);
    await authed(app, publisher.token).post(`${base}/${created.body.data.id}/approve`).send({});
    const [notification] = (await authed(app, dev.token).get('/api/v1/notifications')).body.data;

    const byOther = await authed(app, publisher.token).post(
      `/api/v1/notifications/${notification.id}/read`
    );
    const byOwner = await authed(app, dev.token).post(
      `/api/v1/notifications/${notification.id}/read`
    );

    expect(byOther.status).toBe(404);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.readAt).not.toBeNull();
    expect(
      (await authed(app, dev.token).get('/api/v1/notifications?unread=true')).body.meta.total
    ).toBe(0);
  });
});
