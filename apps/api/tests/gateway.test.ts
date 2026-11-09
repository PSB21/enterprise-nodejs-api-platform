import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { resetCache } from '../src/lib/cache';
import { resetRateLimiter } from '../src/lib/rate-limiter';
import { ApiModel } from '../src/modules/apis/api.model';
import { ApiKeyModel } from '../src/modules/api-keys/api-key.model';
import { UsageLogModel } from '../src/modules/usage/usage-log.model';
import { usageRecorder } from '../src/modules/usage/usage-recorder';
import { issueKey } from './helpers/access';
import { createApi } from './helpers/apis';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { resetMongo, setupMongo, teardownMongo } from './helpers/mongo';
import { authed, createUser } from './helpers/users';

const app = createApp();
let upstream: Server;
let upstreamUrl: string;
let lastUpstreamRequest: { path: string; headers: Record<string, unknown>; body: string };

beforeAll(async () => {
  requireTestDatabase();
  await setupMongo();

  // A real HTTP server playing the upstream API, so the gateway makes real network calls.
  const upstreamApp = express();
  upstreamApp.use(express.text({ type: () => true }));
  upstreamApp.use((req, res, next) => {
    lastUpstreamRequest = { path: req.originalUrl, headers: req.headers, body: req.body };
    next();
  });
  upstreamApp.get('/v1/orders', (_req, res) => {
    res.set('etag', '"abc"').json({ orders: [1, 2, 3] });
  });
  upstreamApp.post('/v1/orders', (req, res) => {
    res.status(201).type('application/json').send(req.body);
  });
  upstreamApp.get('/v1/broken', (_req, res) => {
    res.status(500).json({ error: 'upstream failed' });
  });
  upstreamApp.get('/v1/slow', async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    res.json({ late: true });
  });
  upstreamApp.get('/v1/redirect', (_req, res) => {
    res.redirect(302, 'http://169.254.169.254/latest/meta-data');
  });

  upstream = upstreamApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => upstream.once('listening', resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`;
});
beforeEach(async () => {
  // Write logs buffered by the previous test first, or they would land after the reset.
  await usageRecorder.flush();
  await Promise.all([resetPostgres(), resetMongo()]);
  resetCache();
  resetRateLimiter();
});
afterAll(async () => {
  upstream.close();
  await usageRecorder.stop();
  await Promise.all([prisma.$disconnect(), teardownMongo()]);
});

async function setup(overrides: Record<string, unknown> = {}) {
  const publisher = await createUser('PUBLISHER');
  const dev = await createUser('DEVELOPER');
  const api = await createApi(publisher.user.id, { upstreamUrl, ...overrides });
  const { key, apiKey } = await issueKey(api, dev.user.id);
  return { publisher, dev, api, key, apiKey };
}

const call = (path: string, key?: string) => {
  const req = request(app).get(path);
  return key ? req.set('x-api-key', key) : req;
};

describe('authentication at the gateway', () => {
  it('requires a key', async () => {
    const { api } = await setup();

    const res = await call(`/gateway/${api.slug}/orders`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('API_KEY_MISSING');
  });

  it('rejects an unknown key and a revoked key', async () => {
    const { api, key, apiKey } = await setup();
    await ApiKeyModel.updateOne({ _id: apiKey._id }, { revokedAt: new Date() });

    expect((await call(`/gateway/${api.slug}/orders`, 'ams_made_up')).status).toBe(401);
    expect((await call(`/gateway/${api.slug}/orders`, key)).body.error.code).toBe(
      'INVALID_API_KEY'
    );
  });

  it('rejects a key issued for a different API', async () => {
    const { publisher, key } = await setup();
    const other = await createApi(publisher.user.id, { upstreamUrl });

    const res = await call(`/gateway/${other.slug}/orders`, key);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KEY_NOT_VALID_FOR_API');
  });

  it('returns 404 once an API goes back to draft', async () => {
    const { api, key } = await setup();
    await ApiModel.updateOne({ _id: api._id }, { status: 'draft' });

    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(404);
  });
});

describe('forwarding', () => {
  it('forwards the path and query string and passes the response back', async () => {
    const { api, key } = await setup();

    const res = await call(`/gateway/${api.slug}/orders?page=2&sort=desc`, key);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orders: [1, 2, 3] });
    expect(res.headers.etag).toBe('"abc"');
    expect(lastUpstreamRequest.path).toBe('/v1/orders?page=2&sort=desc');
  });

  it('never forwards the API key, cookies or Authorization header', async () => {
    const { api, key, dev } = await setup();

    await call(`/gateway/${api.slug}/orders`, key)
      .set('Cookie', 'ams_refresh=secret')
      .set('Authorization', 'Bearer secret');

    expect(lastUpstreamRequest.headers['x-api-key']).toBeUndefined();
    expect(lastUpstreamRequest.headers.cookie).toBeUndefined();
    expect(lastUpstreamRequest.headers.authorization).toBeUndefined();
    expect(lastUpstreamRequest.headers['x-ams-consumer']).toBe(dev.user.id);
  });

  it('forwards a request body byte for byte', async () => {
    const { api, key } = await setup();
    const body = '{"item":"Desk","quantity":2}';

    const res = await request(app)
      .post(`/gateway/${api.slug}/orders`)
      .set('x-api-key', key)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(201);
    expect(lastUpstreamRequest.body).toBe(body);
  });

  it("passes upstream errors through with the upstream's status", async () => {
    const { api, key } = await setup();

    const res = await call(`/gateway/${api.slug}/broken`, key);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'upstream failed' });
  });

  it('returns 504 when the upstream is too slow', async () => {
    const { api, key } = await setup();

    const res = await call(`/gateway/${api.slug}/slow`, key);

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('returns 502 when the upstream cannot be reached', async () => {
    const { api, key } = await setup({ upstreamUrl: 'http://127.0.0.1:1/v1' });

    const res = await call(`/gateway/${api.slug}/orders`, key);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('does not follow redirects to other hosts', async () => {
    const { api, key } = await setup();

    const res = await call(`/gateway/${api.slug}/redirect`, key);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://169.254.169.254/latest/meta-data');
  });

  it.each(['..', '%2e%2e', '.', '%2Fadmin'])(
    'rejects the path segment %s, which could escape the base path',
    async (segment) => {
      const { api, key } = await setup();

      const res = await call(`/gateway/${api.slug}/${segment}/secret`, key);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PATH');
    }
  );

  it('marks deprecated APIs with a header', async () => {
    const { api, key } = await setup({ status: 'deprecated' });

    const res = await call(`/gateway/${api.slug}/orders`, key);

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
  });
});

describe('caching', () => {
  it('looks a key up in the database once, then serves it from the cache', async () => {
    const { api, key } = await setup();
    const lookups = jest.spyOn(ApiKeyModel, 'findOne');

    await call(`/gateway/${api.slug}/orders`, key);
    await call(`/gateway/${api.slug}/orders`, key);

    expect(lookups).toHaveBeenCalledTimes(1);
    lookups.mockRestore();
  });

  it('stops a revoked key at once, even though it was cached', async () => {
    const { api, key, apiKey, dev } = await setup();
    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(200);

    await authed(app, dev.token).delete(`/api/v1/api-keys/${apiKey.id}`);

    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(401);
  });

  it('stops keys at once when access is revoked', async () => {
    const { api, key, publisher } = await setup();
    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(200);
    const [request] = (await authed(app, publisher.token).get('/api/v1/access-requests')).body.data;

    await authed(app, publisher.token)
      .post(`/api/v1/access-requests/${request.id}/revoke`)
      .send({ note: 'Access ended' });

    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(401);
  });

  it('applies a status change made through the API at once', async () => {
    const { api, key, publisher } = await setup();
    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(200);

    await authed(app, publisher.token).patch(`/api/v1/apis/${api.slug}`).send({ status: 'draft' });

    expect((await call(`/gateway/${api.slug}/orders`, key)).status).toBe(404);
  });
});

describe('plan limits', () => {
  it("enforces the plan's requests per minute, with rate limit headers", async () => {
    // The test helper's Free plan allows 10 requests per minute.
    const { api, key } = await setup();

    const responses = [];
    for (let i = 0; i < 11; i += 1) responses.push(await call(`/gateway/${api.slug}/orders`, key));

    expect(responses.slice(0, 10).every((r) => r.status === 200)).toBe(true);
    expect(responses[0]!.headers['x-ratelimit-limit']).toBe('10');
    expect(responses[9]!.headers['x-ratelimit-remaining']).toBe('0');
    const limited = responses[10]!;
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('enforces a monthly quota', async () => {
    const { api, key } = await setup({
      plans: [{ name: 'Free', rateLimitPerMinute: 100, monthlyQuota: 2 }],
    });

    await call(`/gateway/${api.slug}/orders`, key);
    await call(`/gateway/${api.slug}/orders`, key);
    const third = await call(`/gateway/${api.slug}/orders`, key);

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('logs rate-limited calls, so they show up in analytics', async () => {
    const { api, key } = await setup({
      plans: [{ name: 'Free', rateLimitPerMinute: 1 }],
    });

    await call(`/gateway/${api.slug}/orders`, key);
    await call(`/gateway/${api.slug}/orders`, key);
    await usageRecorder.flush();

    expect((await UsageLogModel.find().lean()).map((l) => l.statusCode).sort()).toEqual([200, 429]);
  });
});

describe('usage logging', () => {
  it('logs each call with its status and latency, and records when the key was used', async () => {
    const { api, key, apiKey, dev } = await setup();

    await call(`/gateway/${api.slug}/orders`, key);
    await call(`/gateway/${api.slug}/broken`, key);
    await usageRecorder.flush();

    const logs = await UsageLogModel.find().sort({ at: 1 }).lean();
    expect(logs.map((l) => [l.method, l.path, l.statusCode])).toEqual([
      ['GET', `/${api.slug}/orders`, 200],
      ['GET', `/${api.slug}/broken`, 500],
    ]);
    expect(logs.every((l) => l.developerId === dev.user.id && l.latencyMs >= 0)).toBe(true);
    expect((await ApiKeyModel.findById(apiKey._id))!.lastUsedAt).not.toBeNull();
  });

  it('does not log requests without a valid key', async () => {
    const { api } = await setup();

    await call(`/gateway/${api.slug}/orders`, 'ams_made_up');
    await usageRecorder.flush();

    expect(await UsageLogModel.countDocuments()).toBe(0);
  });
});

describe('sample upstream', () => {
  it('serves orders and can simulate failures', async () => {
    expect((await request(app).get('/mock/orders')).body.data).toHaveLength(3);
    expect((await request(app).get('/mock/orders/2')).body.data.item).toBe('USB-C cable');
    expect((await request(app).get('/mock/orders?fail=503')).status).toBe(503);
  });
});
