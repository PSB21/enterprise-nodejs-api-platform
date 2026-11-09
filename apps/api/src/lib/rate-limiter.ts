import type Redis from 'ioredis';

import { getRedis } from './redis';

export interface HitResult {
  /** Hits so far in the current window, including this one. */
  count: number;
  /** Milliseconds until the window resets. */
  resetMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<HitResult>;
}

/** Counts hits in memory. Correct for one server process only. */
export class MemoryStore implements RateLimitStore {
  private windows = new Map<string, { count: number; expiresAt: number }>();

  async hit(key: string, windowMs: number): Promise<HitResult> {
    const now = Date.now();
    let entry = this.windows.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      this.windows.set(key, entry);
      this.sweep(now);
    }

    entry.count += 1;
    return { count: entry.count, resetMs: entry.expiresAt - now };
  }

  /** Drops expired windows now and then, so memory does not grow forever. */
  private sweep(now: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, entry] of this.windows) {
      if (entry.expiresAt <= now) this.windows.delete(key);
    }
  }
}

// Runs inside Redis as one atomic step: increment, and on the first hit set the expiry. Doing
// these as two separate commands would leave a counter that never expires if the process
// crashed in between.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

type RedisWithHit = Redis & {
  rateLimitHit(key: string, windowMs: number): Promise<[number, number]>;
};

/** Counts hits in Redis, so every server process shares the same counters. */
export class RedisStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {
    if (!('rateLimitHit' in redis)) {
      redis.defineCommand('rateLimitHit', { numberOfKeys: 1, lua: HIT_SCRIPT });
    }
  }

  async hit(key: string, windowMs: number): Promise<HitResult> {
    const [count, ttl] = await (this.redis as RedisWithHit).rateLimitHit(key, windowMs);
    return { count, resetMs: ttl > 0 ? ttl : windowMs };
  }
}

export interface Decision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/**
 * Fixed-window rate limiting: at most `limit` hits per window, per key.
 *
 * Simple and cheap: one counter per key. Its weakness is the window edge: a client can send
 * the full limit at the end of one window and again at the start of the next. A sliding
 * window fixes that at the cost of more memory per key.
 */
export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  async consume(key: string, limit: number, windowMs: number): Promise<Decision> {
    try {
      const { count, resetMs } = await this.store.hit(key, windowMs);
      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: Math.ceil(resetMs / 1000),
      };
    } catch (err) {
      // Fail open: if the counter store is down, let traffic through rather than block every
      // caller. The opposite choice suits systems where overuse is costlier than an outage.
      console.error('Rate limiter unavailable, allowing request:', err);
      return { allowed: true, limit, remaining: limit, resetSeconds: 0 };
    }
  }
}

let shared: RateLimiter | undefined;

/** The app's rate limiter: Redis when configured, otherwise memory. */
export function getRateLimiter() {
  if (!shared) {
    const redis = getRedis();
    shared = new RateLimiter(redis ? new RedisStore(redis) : new MemoryStore());
  }
  return shared;
}

/** Lets tests start from empty counters. */
export function resetRateLimiter() {
  shared = undefined;
}
