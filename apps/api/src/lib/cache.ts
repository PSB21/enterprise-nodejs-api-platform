import type Redis from 'ioredis';

import { env } from '../config/env';
import { getRedis } from './redis';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

/** A small in-memory cache with expiry. Each server process has its own copy. */
export class MemoryCache implements Cache {
  private entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly maxEntries = 5_000) {}

  async get<T>(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlMs: number) {
    // Maps keep insertion order, so the first key is the oldest: drop it when full.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(...keys: string[]) {
    for (const key of keys) this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

/** A cache in Redis, shared by every server process. Values are stored as JSON. */
export class RedisCache implements Cache {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string) {
    const raw = await this.redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlMs: number) {
    await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
}

/** A cache that never stores anything, for CACHE_ENABLED=false and for measuring. */
class NoCache implements Cache {
  async get() {
    return undefined;
  }
  async set() {}
  async del() {}
}

let shared: Cache | undefined;

export function getCache(): Cache {
  if (!shared) {
    const redis = getRedis();
    shared = !env.CACHE_ENABLED ? new NoCache() : redis ? new RedisCache(redis) : new MemoryCache();
  }
  return shared;
}

export function resetCache() {
  shared = undefined;
}

/**
 * Reads through the cache: returns the cached value, or loads it, caches it and returns it.
 * A cache failure is logged and treated as a miss, so a Redis outage slows the API down
 * instead of breaking it.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T | null>) {
  const cache = getCache();

  try {
    const hit = await cache.get<T>(key);
    if (hit !== undefined) return hit;
  } catch (err) {
    console.error('Cache read failed:', err);
  }

  const value = await load();
  // Misses (null) are not cached, so a newly created record is visible straight away.
  if (value !== null) {
    await cache
      .set(key, value, ttlMs)
      .catch((err: unknown) => console.error('Cache write failed:', err));
  }
  return value;
}

export async function invalidate(...keys: string[]) {
  await getCache()
    .del(...keys)
    .catch((err: unknown) => console.error('Cache delete failed:', err));
}
