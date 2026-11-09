import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { UsageLogModel } from '../src/modules/usage/usage-log.model';
import { issueKey } from './helpers/access';
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

const HOUR = 3_600_000;
const day = (n: number) => new Date(Date.UTC(2026, 10, n));

/** Inserts usage logs with known values, so every number in the response can be checked. */
async function seedUsage() {
  const publisher = await createUser('PUBLISHER');
  const alice = await createUser('DEVELOPER');
  const bob = await createUser('DEVELOPER');
  const api = await createApi(publisher.user.id);
  const aliceKey = await issueKey(api, alice.user.id);
  const bobKey = await issueKey(api, bob.user.id);

  const log = (who: typeof aliceKey, at: Date, statusCode: number, latencyMs: number) => ({
    apiId: api._id,
    keyId: who.apiKey._id,
    developerId: who.apiKey.developerId,
    method: 'GET',
    path: `/${api.slug}/orders`,
    statusCode,
    latencyMs,
    at,
  });

  // Day 1: Alice makes 6 calls (one 500, one 404); Bob makes 2. Latencies 10..80 ms.
  await UsageLogModel.insertMany([
    log(aliceKey, new Date(day(1).getTime() + 1 * HOUR), 200, 10),
    log(aliceKey, new Date(day(1).getTime() + 1 * HOUR), 200, 20),
    log(aliceKey, new Date(day(1).getTime() + 2 * HOUR), 200, 30),
    log(aliceKey, new Date(day(1).getTime() + 2 * HOUR), 404, 40),
    log(aliceKey, new Date(day(1).getTime() + 3 * HOUR), 500, 50),
    log(aliceKey, new Date(day(1).getTime() + 3 * HOUR), 200, 60),
    log(bobKey, new Date(day(1).getTime() + 5 * HOUR), 200, 70),
    log(bobKey, new Date(day(1).getTime() + 5 * HOUR), 200, 80),
    // Outside the range used in the tests, so it must not be counted.
    log(bobKey, day(20), 200, 999),
  ]);

  return { publisher, alice, bob, api };
}

const range = `from=${day(1).toISOString()}&to=${day(2).toISOString()}`;

describe('GET /api/v1/analytics/apis/:id/summary', () => {
  it('computes totals, error rate, latency, status codes and top consumers', async () => {
    const { publisher, alice, api } = await seedUsage();

    const res = await authed(app, publisher.token).get(
      `/api/v1/analytics/apis/${api.slug}/summary?${range}`
    );

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({
      requests: 8,
      clientErrors: 1,
      serverErrors: 1,
      errorRate: 12.5,
      avgLatencyMs: 45,
    });
    // Approximate percentile of 10..80: the 95th falls on the highest value.
    expect(data.p95LatencyMs).toBe(80);
    expect(data.byStatus).toEqual([
      { statusCode: 200, count: 6 },
      { statusCode: 404, count: 1 },
      { statusCode: 500, count: 1 },
    ]);
    expect(data.topConsumers[0]).toMatchObject({
      developerId: alice.user.id,
      name: alice.user.name,
      requests: 6,
    });
  });

  it('returns zeros for a range with no traffic', async () => {
    const { publisher, api } = await seedUsage();

    const res = await authed(app, publisher.token).get(
      `/api/v1/analytics/apis/${api.slug}/summary?from=${day(5).toISOString()}&to=${day(6).toISOString()}`
    );

    expect(res.body.data).toMatchObject({ requests: 0, errorRate: 0, p95LatencyMs: null });
  });

  it("is only for the API's owner and admins", async () => {
    const { alice, api } = await seedUsage();
    const otherPublisher = await createUser('PUBLISHER');
    const admin = await createUser('ADMIN');
    const url = `/api/v1/analytics/apis/${api.slug}/summary?${range}`;

    expect((await authed(app, alice.token).get(url)).status).toBe(403);
    expect((await authed(app, otherPublisher.token).get(url)).status).toBe(403);
    expect((await authed(app, admin.token).get(url)).status).toBe(200);
  });
});

describe('GET /api/v1/analytics/apis/:id/timeseries', () => {
  it('returns hourly buckets, including empty ones', async () => {
    const { publisher, api } = await seedUsage();

    const res = await authed(app, publisher.token).get(
      `/api/v1/analytics/apis/${api.slug}/timeseries?${range}&interval=hour`
    );

    const points = res.body.data.points as { at: string; requests: number }[];
    expect(points).toHaveLength(24);
    expect(points.slice(0, 6).map((p) => p.requests)).toEqual([0, 2, 2, 2, 0, 2]);
    expect(points[3]).toMatchObject({ serverErrors: 1, avgLatencyMs: 55 });
  });

  it.each([
    ['from after to', `from=${day(2).toISOString()}&to=${day(1).toISOString()}`],
    ['more than 90 days', `from=2026-01-01T00:00:00Z&to=2026-11-01T00:00:00Z`],
    [
      'hourly data over 7 days',
      `from=${day(1).toISOString()}&to=${day(20).toISOString()}&interval=hour`,
    ],
  ])('rejects %s', async (_label, query) => {
    const { publisher, api } = await seedUsage();

    const res = await authed(app, publisher.token).get(
      `/api/v1/analytics/apis/${api.slug}/timeseries?${query}`
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/analytics/me', () => {
  it('shows a developer only their own usage', async () => {
    const { alice, api } = await seedUsage();

    const res = await authed(app, alice.token).get(`/api/v1/analytics/me?${range}`);

    expect(res.status).toBe(200);
    expect(res.body.data.apis).toEqual([
      {
        api: { id: api.id, name: api.name, slug: api.slug },
        requests: 6,
        clientErrors: 1,
        serverErrors: 1,
        avgLatencyMs: 35,
      },
    ]);
    expect(res.body.data.timeseries.interval).toBe('hour');
  });
});
