import { trusted } from 'mongoose';

import { env } from '../../config/env';
import { AppError } from '../../errors/app-error';
import { cached, invalidate } from '../../lib/cache';
import { sha256 } from '../../lib/hash';
import { getRateLimiter, type Decision } from '../../lib/rate-limiter';
import { ApiModel, type API_STATUSES } from '../apis/api.model';
import { assertAllowedUpstream } from '../apis/api.service';
import { ApiKeyModel } from '../api-keys/api-key.model';

// Short lifetimes: an entry can be out of date for at most this long if an invalidation is
// missed. Revoking a key and editing an API both invalidate immediately.
const KEY_TTL_MS = 60_000;
const API_TTL_MS = 30_000;

export interface GatewayKey {
  id: string;
  apiId: string;
  developerId: string;
  planName: string;
}

export interface GatewayApi {
  id: string;
  slug: string;
  status: (typeof API_STATUSES)[number];
  upstreamUrl: string;
  plans: { name: string; rateLimitPerMinute: number; monthlyQuota?: number | null }[];
}

export const keyCacheKey = (keyHash: string) => `gateway:key:${keyHash}`;
export const apiCacheKey = (slug: string) => `gateway:api:${slug.toLowerCase()}`;

/**
 * Finds a working key from the raw value in the x-api-key header. Cached, because every
 * gateway call needs it; without the cache each call would wait for a database round trip.
 */
export async function findActiveKey(rawKey: string): Promise<GatewayKey> {
  const keyHash = sha256(rawKey);

  const key = await cached<GatewayKey>(keyCacheKey(keyHash), KEY_TTL_MS, async () => {
    const doc = await ApiKeyModel.findOne({ keyHash, revokedAt: null }).lean();
    return doc
      ? {
          id: String(doc._id),
          apiId: String(doc.apiId),
          developerId: doc.developerId,
          planName: doc.planName,
        }
      : null;
  });

  if (!key) {
    throw new AppError(401, 'INVALID_API_KEY', 'The API key is invalid or has been revoked');
  }

  return key;
}

/** Finds an API that can receive traffic. Deprecated APIs still work, but say so in a header. */
export async function findServedApi(slug: string): Promise<GatewayApi> {
  const api = await cached<GatewayApi>(apiCacheKey(slug), API_TTL_MS, async () => {
    const doc = await ApiModel.findOne({ slug: slug.toLowerCase() }).lean();
    return doc
      ? {
          id: String(doc._id),
          slug: doc.slug,
          status: doc.status,
          upstreamUrl: doc.upstreamUrl,
          plans: doc.plans.map((p) => ({
            name: p.name,
            rateLimitPerMinute: p.rateLimitPerMinute,
            monthlyQuota: p.monthlyQuota ?? null,
          })),
        }
      : null;
  });

  if (!api || api.status === 'draft') {
    throw new AppError(404, 'API_NOT_FOUND', 'API not found');
  }

  return api;
}

/** Removes keys from the gateway cache, so a revocation takes effect immediately. */
export function invalidateKeys(keyHashes: string[]) {
  return invalidate(...keyHashes.map(keyCacheKey));
}

export function invalidateApi(slug: string) {
  return invalidate(apiCacheKey(slug));
}

const MINUTE_MS = 60_000;
const QUOTA_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Applies the key's plan: requests per minute, and an optional monthly quota. Returns the
 * per-minute decision so the gateway can send rate limit headers.
 */
export async function enforcePlan(key: GatewayKey, api: GatewayApi): Promise<Decision | null> {
  if (!env.RATE_LIMIT_ENABLED) return null;

  // If the plan was removed after the key was issued, apply the strictest remaining plan.
  const plan =
    api.plans.find((p) => p.name === key.planName) ??
    [...api.plans].sort((a, b) => a.rateLimitPerMinute - b.rateLimitPerMinute)[0];
  if (!plan) return null;

  const limiter = getRateLimiter();
  const minute = await limiter.consume(`rl:key:${key.id}`, plan.rateLimitPerMinute, MINUTE_MS);

  if (!minute.allowed) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Rate limit of ${plan.rateLimitPerMinute} requests per minute reached`,
      {
        retryAfterSeconds: minute.resetSeconds,
      }
    );
  }

  if (plan.monthlyQuota) {
    // The month is part of the key, so each calendar month starts a fresh count.
    const month = new Date().toISOString().slice(0, 7);
    const quota = await limiter.consume(
      `quota:key:${key.id}:${month}`,
      plan.monthlyQuota,
      QUOTA_WINDOW_MS
    );
    if (!quota.allowed) {
      throw new AppError(
        429,
        'QUOTA_EXCEEDED',
        `Monthly quota of ${plan.monthlyQuota} requests used up`
      );
    }
  }

  return minute;
}

/**
 * Builds the upstream URL from the API's base URL and the rest of the gateway path.
 *
 * `.` and `..` segments are rejected: URL normalisation would otherwise let
 * /gateway/orders/../../admin escape the API's base path on the upstream host.
 */
export function buildUpstreamUrl(baseUrl: string, segments: string[], originalUrl: string) {
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
      throw new AppError(400, 'INVALID_PATH', 'The request path is not allowed');
    }
  }

  const url = new URL(baseUrl);
  const extra = segments.map(encodeURIComponent).join('/');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${extra ? `/${extra}` : ''}`;
  url.search = new URL(originalUrl, 'http://gateway.local').search;

  // Checked again at request time, in case the allowlist changed since the API was saved.
  assertAllowedUpstream(url.toString());
  return url;
}

const ONE_MINUTE = 60_000;

/** Records when a key was last used, at most once a minute per key, without blocking. */
export function touchKey(keyId: string) {
  const now = new Date();
  void ApiKeyModel.updateOne(
    {
      _id: keyId,
      // $or is a top-level operator we wrote; $lt sits inside a value, so it must be trusted.
      $or: [
        { lastUsedAt: null },
        { lastUsedAt: trusted({ $lt: new Date(now.getTime() - ONE_MINUTE) }) },
      ],
    },
    { $set: { lastUsedAt: now } }
  ).catch((err: unknown) => console.error('Failed to update lastUsedAt:', err));
}
