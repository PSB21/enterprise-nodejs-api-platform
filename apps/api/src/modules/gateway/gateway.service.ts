import { trusted } from 'mongoose';

import { AppError } from '../../errors/app-error';
import { sha256 } from '../../lib/hash';
import { ApiModel } from '../apis/api.model';
import { assertAllowedUpstream } from '../apis/api.service';
import { ApiKeyModel } from '../api-keys/api-key.model';

/** Finds a working key from the raw value in the x-api-key header. */
export async function findActiveKey(rawKey: string) {
  // The key is looked up by its hash, so the raw key never needs to be stored or compared.
  const key = await ApiKeyModel.findOne({ keyHash: sha256(rawKey), revokedAt: null });

  if (!key) {
    throw new AppError(401, 'INVALID_API_KEY', 'The API key is invalid or has been revoked');
  }

  return key;
}

/** Finds an API that can receive traffic. Deprecated APIs still work, but say so in a header. */
export async function findServedApi(slug: string) {
  const api = await ApiModel.findOne({ slug: slug.toLowerCase() });

  if (!api || api.status === 'draft') {
    throw new AppError(404, 'API_NOT_FOUND', 'API not found');
  }

  return api;
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
export function touchKey(keyId: unknown) {
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
