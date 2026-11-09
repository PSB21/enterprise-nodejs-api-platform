import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { ApiModel } from '../src/modules/apis/api.model';
import { apiInput, createApi } from './helpers/apis';
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

describe('POST /api/v1/apis', () => {
  it('lets a publisher create an API, deriving the slug from the name', async () => {
    const publisher = await createUser('PUBLISHER');

    const res = await authed(app, publisher.token)
      .post('/api/v1/apis')
      .send(apiInput({ name: 'Currency Rates!' }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      slug: 'currency-rates',
      status: 'draft',
      ownerId: publisher.user.id,
      upstreamUrl: 'http://localhost:5000/mock/orders',
    });
    expect(res.body.data.plans).toHaveLength(2);
  });

  it('returns 403 for a developer', async () => {
    const dev = await createUser('DEVELOPER');

    const res = await authed(app, dev.token).post('/api/v1/apis').send(apiInput());

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate slug with 409', async () => {
    const publisher = await createUser('PUBLISHER');
    await authed(app, publisher.token)
      .post('/api/v1/apis')
      .send(apiInput({ slug: 'maps' }));

    const res = await authed(app, publisher.token)
      .post('/api/v1/apis')
      .send(apiInput({ slug: 'maps' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('rejects an upstream host that is not on the allowlist', async () => {
    const publisher = await createUser('PUBLISHER');

    const res = await authed(app, publisher.token)
      .post('/api/v1/apis')
      .send(apiInput({ upstreamUrl: 'http://169.254.169.254/latest/meta-data' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPSTREAM_NOT_ALLOWED');
  });

  it.each([
    ['no plans', { plans: [] }],
    [
      'duplicate plan names',
      {
        plans: [
          { name: 'Free', rateLimitPerMinute: 1 },
          { name: 'free', rateLimitPerMinute: 2 },
        ],
      },
    ],
    ['a non-http upstream', { upstreamUrl: 'file:///etc/passwd' }],
    ['a bad slug', { slug: 'Not A Slug' }],
  ])('returns 400 for %s', async (_label, overrides) => {
    const publisher = await createUser('PUBLISHER');

    const res = await authed(app, publisher.token).post('/api/v1/apis').send(apiInput(overrides));

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/apis', () => {
  it('shows developers only published APIs, without upstream URLs', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    await createApi(publisher.user.id, { name: 'Live One' });
    await createApi(publisher.user.id, { name: 'Draft One', status: 'draft' });

    const res = await authed(app, dev.token).get('/api/v1/apis');

    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(['Live One']);
    expect(res.body.data[0].upstreamUrl).toBeUndefined();
  });

  it("shows a publisher their own drafts but not other publishers' drafts", async () => {
    const me = await createUser('PUBLISHER');
    const other = await createUser('PUBLISHER');
    await createApi(me.user.id, { name: 'My Draft', status: 'draft' });
    await createApi(other.user.id, { name: 'Their Draft', status: 'draft' });

    const res = await authed(app, me.token).get('/api/v1/apis');

    expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(['My Draft']);
  });

  it('searches by text, ranking name matches first, and filters by tag', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    await createApi(publisher.user.id, {
      name: 'Shipping Tracker',
      description: 'Track parcels across couriers, including weather delays.',
      tags: ['logistics'],
    });
    await createApi(publisher.user.id, { name: 'Weather Now', tags: ['weather'] });

    const search = await authed(app, dev.token).get('/api/v1/apis?q=weather');
    const byTag = await authed(app, dev.token).get('/api/v1/apis?tag=logistics');

    expect(search.body.data.map((a: { name: string }) => a.name)).toEqual([
      'Weather Now',
      'Shipping Tracker',
    ]);
    expect(byTag.body.data.map((a: { name: string }) => a.name)).toEqual(['Shipping Tracker']);
  });

  it('pages results', async () => {
    const publisher = await createUser('PUBLISHER');
    for (let i = 0; i < 3; i += 1) await createApi(publisher.user.id);

    const res = await authed(app, publisher.token).get('/api/v1/apis?limit=2&page=2');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('rejects a repeated query parameter instead of passing an array to MongoDB', async () => {
    const dev = await createUser('DEVELOPER');

    const res = await authed(app, dev.token).get('/api/v1/apis?tag=a&tag=b');

    expect(res.status).toBe(400);
  });

  it('does not turn bracket syntax in the query string into a MongoDB operator', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    await createApi(publisher.user.id, { tags: ['weather'] });

    // With an object-parsing query parser this would become { tags: { $ne: 'x' } }.
    const res = await authed(app, dev.token).get('/api/v1/apis?tag[$ne]=x');

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
  });
});

describe('GET /api/v1/apis/:idOrSlug', () => {
  it('finds an API by slug or by id', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const api = await createApi(publisher.user.id);

    const bySlug = await authed(app, dev.token).get(`/api/v1/apis/${api.slug}`);
    const byId = await authed(app, dev.token).get(`/api/v1/apis/${api.id}`);

    expect(bySlug.body.data.id).toBe(api.id);
    expect(byId.body.data.slug).toBe(api.slug);
  });

  it('returns 404, not 403, for a draft the user cannot see', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const draft = await createApi(publisher.user.id, { status: 'draft' });

    const res = await authed(app, dev.token).get(`/api/v1/apis/${draft.slug}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/apis/:idOrSlug', () => {
  it('lets the owner publish their API', async () => {
    const publisher = await createUser('PUBLISHER');
    const api = await createApi(publisher.user.id, { status: 'draft' });

    const res = await authed(app, publisher.token)
      .patch(`/api/v1/apis/${api.id}`)
      .send({ status: 'published' });

    expect(res.status).toBe(200);
    expect((await ApiModel.findById(api.id))!.status).toBe('published');
  });

  it("returns 403 when a publisher edits someone else's published API", async () => {
    const owner = await createUser('PUBLISHER');
    const other = await createUser('PUBLISHER');
    const api = await createApi(owner.user.id);

    const res = await authed(app, other.token)
      .patch(`/api/v1/apis/${api.id}`)
      .send({ description: 'Taken over by someone else entirely.' });

    expect(res.status).toBe(403);
  });

  it('lets an admin edit any API', async () => {
    const owner = await createUser('PUBLISHER');
    const admin = await createUser('ADMIN');
    const api = await createApi(owner.user.id);

    const res = await authed(app, admin.token)
      .patch(`/api/v1/apis/${api.id}`)
      .send({ status: 'deprecated' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('deprecated');
  });

  it('changes only the fields that were sent', async () => {
    const publisher = await createUser('PUBLISHER');
    const api = await createApi(publisher.user.id, { tags: ['maps', 'geo'] });

    await authed(app, publisher.token)
      .patch(`/api/v1/apis/${api.id}`)
      .send({ description: 'A clearer description of this API.' });

    const saved = (await ApiModel.findById(api.id))!;
    expect(saved.status).toBe('published');
    expect(saved.tags).toEqual(['maps', 'geo']);
  });

  it('rejects an empty update', async () => {
    const publisher = await createUser('PUBLISHER');
    const api = await createApi(publisher.user.id);

    const res = await authed(app, publisher.token).patch(`/api/v1/apis/${api.id}`).send({});

    expect(res.status).toBe(400);
  });
});
