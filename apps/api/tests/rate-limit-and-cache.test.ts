import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { MemoryCache, RedisCache } from '../src/lib/cache';
import { MemoryStore, RateLimiter, RedisStore, type RateLimitStore } from '../src/lib/rate-limiter';

// The same behaviour is checked against memory and a Redis stand-in. CI also runs a real Redis
// when TEST_REDIS_URL is set (see the end of this file).
const stores: [string, () => RateLimitStore][] = [
  ['memory', () => new MemoryStore()],
  ['redis', () => new RedisStore(new RedisMock())],
];

describe.each(stores)('RateLimiter with the %s store', (_name, makeStore) => {
  it('allows up to the limit, then refuses, and reports what is left', async () => {
    const limiter = new RateLimiter(makeStore());

    const decisions = [];
    for (let i = 0; i < 4; i += 1) decisions.push(await limiter.consume('k', 3, 60_000));

    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions.map((d) => d.remaining)).toEqual([2, 1, 0, 0]);
    expect(decisions[3]!.resetSeconds).toBeGreaterThan(0);
    expect(decisions[3]!.resetSeconds).toBeLessThanOrEqual(60);
  });

  it('counts each key separately', async () => {
    const limiter = new RateLimiter(makeStore());

    await limiter.consume('a', 1, 60_000);

    expect((await limiter.consume('b', 1, 60_000)).allowed).toBe(true);
    expect((await limiter.consume('a', 1, 60_000)).allowed).toBe(false);
  });
});

describe('MemoryStore', () => {
  it('starts a new window once the old one expires', async () => {
    const limiter = new RateLimiter(new MemoryStore());

    await limiter.consume('k', 1, 50);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((await limiter.consume('k', 1, 50)).allowed).toBe(true);
  });
});

describe('RateLimiter when its store fails', () => {
  it('lets requests through (fails open) and logs the problem', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error('connection refused')) };

    const decision = await new RateLimiter(broken).consume('k', 1, 60_000);

    expect(decision.allowed).toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe.each([
  ['memory', () => new MemoryCache()],
  ['redis', () => new RedisCache(new RedisMock())],
])('%s cache', (_name, makeCache) => {
  it('stores, expires and deletes values', async () => {
    const cache = makeCache();

    await cache.set('a', { n: 1 }, 50);
    await cache.set('b', 'kept', 60_000);
    expect(await cache.get('a')).toEqual({ n: 1 });

    await new Promise((resolve) => setTimeout(resolve, 80));
    await cache.del('b');

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });
});

describe('MemoryCache', () => {
  it('drops the oldest entry when full', async () => {
    const cache = new MemoryCache(2);
    await cache.set('first', 1, 60_000);
    await cache.set('second', 2, 60_000);
    await cache.set('third', 3, 60_000);

    expect(await cache.get('first')).toBeUndefined();
    expect(await cache.get('third')).toBe(3);
  });
});

// Only in CI, against a real Redis server.
const withRealRedis = process.env.TEST_REDIS_URL ? describe : describe.skip;

withRealRedis('RedisStore against a real Redis', () => {
  it('counts atomically under concurrent hits', async () => {
    const redis = new Redis(process.env.TEST_REDIS_URL!);
    const limiter = new RateLimiter(new RedisStore(redis));
    const key = `test:${Date.now()}`;

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume(key, 10, 60_000))
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(10);
    await redis.quit();
  });

  it('expires the window, so the counter does not live forever', async () => {
    const redis = new Redis(process.env.TEST_REDIS_URL!);
    const limiter = new RateLimiter(new RedisStore(redis));
    const key = `test:expiry:${Date.now()}`;

    await limiter.consume(key, 1, 100);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect((await limiter.consume(key, 1, 100)).allowed).toBe(true);
    await redis.quit();
  });
});
