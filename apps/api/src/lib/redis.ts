import Redis from 'ioredis';

import { env } from '../config/env';

let client: Redis | null | undefined;

/**
 * The shared Redis connection, or null when REDIS_URL is not set. Without Redis, rate limits
 * and caches fall back to memory, which works for a single server but not across several.
 */
export function getRedis(): Redis | null {
  if (client === undefined) {
    client = env.REDIS_URL
      ? new Redis(env.REDIS_URL, {
          // Fail fast instead of queueing commands forever while Redis is down.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
        })
      : null;
    client?.on('error', (err) => console.error('Redis error:', err.message));
  }
  return client;
}

/** Lets tests use a fake Redis. */
export function setRedis(redis: Redis | null) {
  client = redis;
}

export async function disconnectRedis() {
  if (client) {
    await client.quit().catch(() => undefined);
  }
  client = undefined;
}
