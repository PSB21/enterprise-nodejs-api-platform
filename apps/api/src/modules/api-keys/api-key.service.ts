import type { ClientSession, Types } from 'mongoose';

import { AppError } from '../../errors/app-error';
import { randomSecret, sha256 } from '../../lib/hash';
import { pageMeta, toSkip, type Pagination } from '../../lib/pagination';
import { apiSummaries } from '../access-requests/access-request.service';
import { AccessRequestModel } from '../access-requests/access-request.model';
import type { Viewer } from '../apis/api.service';
import { invalidateKeys } from '../gateway/gateway.service';
import { ApiKeyModel, type ApiKeyDocument } from './api-key.model';

/** A developer may hold this many working keys per approved request, for rotation. */
export const MAX_ACTIVE_KEYS = 5;
const KEY_PREFIX = 'ams_';

export function generateApiKey() {
  // 32 random bytes: far too many possibilities to guess.
  const key = `${KEY_PREFIX}${randomSecret(32)}`;
  return { key, prefix: key.slice(0, 12), keyHash: sha256(key) };
}

export function toApiKeyResponse(
  key: ApiKeyDocument,
  api?: { id: string; name: string; slug: string }
) {
  return {
    id: key.id as string,
    name: key.name,
    prefix: key.prefix,
    api: api ?? { id: String(key.apiId) },
    accessRequestId: String(key.accessRequestId),
    planName: key.planName,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

export async function createApiKey(accessRequestId: string, name: string, viewer: Viewer) {
  const request = await AccessRequestModel.findOne({
    _id: accessRequestId,
    developerId: viewer.id,
  });

  if (!request) {
    throw new AppError(404, 'ACCESS_REQUEST_NOT_FOUND', 'Access request not found');
  }
  if (request.status !== 'approved') {
    throw new AppError(409, 'ACCESS_NOT_APPROVED', 'Keys can only be created for approved access');
  }

  const active = await ApiKeyModel.countDocuments({ accessRequestId, revokedAt: null });
  if (active >= MAX_ACTIVE_KEYS) {
    throw new AppError(
      409,
      'KEY_LIMIT_REACHED',
      `You can have at most ${MAX_ACTIVE_KEYS} active keys per API. Revoke one first.`
    );
  }

  const { key, prefix, keyHash } = generateApiKey();
  const apiKey = await ApiKeyModel.create({
    accessRequestId: request._id,
    apiId: request.apiId,
    developerId: viewer.id,
    planName: request.planName,
    name,
    prefix,
    keyHash,
  });

  // The only time the full key is ever returned. After this, nobody can see it again.
  return { key, apiKey };
}

export async function listApiKeys(query: Pagination & { includeRevoked: boolean }, viewer: Viewer) {
  const filter = {
    ...(viewer.role === 'ADMIN' ? {} : { developerId: viewer.id }),
    ...(query.includeRevoked ? {} : { revokedAt: null }),
  };

  const [keys, total] = await Promise.all([
    ApiKeyModel.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit),
    ApiKeyModel.countDocuments(filter),
  ]);
  const apis = await apiSummaries(keys.map((k) => k.apiId));

  return {
    data: keys.map((k) => toApiKeyResponse(k, apis.get(String(k.apiId)))),
    meta: pageMeta(query, total),
  };
}

/** Revokes one key. Revoking an already revoked key changes nothing. */
export async function revokeApiKey(id: string, viewer: Viewer) {
  const owner = viewer.role === 'ADMIN' ? {} : { developerId: viewer.id };
  const key = await ApiKeyModel.findOne({ _id: id, ...owner });

  if (!key) {
    throw new AppError(404, 'API_KEY_NOT_FOUND', 'API key not found');
  }

  if (!key.revokedAt) {
    key.revokedAt = new Date();
    await key.save();
  }

  // The gateway caches keys; without this, a revoked key would keep working until it expired.
  await invalidateKeys([key.keyHash]);
  return key;
}

/** Clears the gateway cache for every key of a request, after its keys were revoked. */
export async function invalidateKeysForRequest(accessRequestId: Types.ObjectId) {
  const keys = await ApiKeyModel.find({ accessRequestId }).select('keyHash').lean();
  await invalidateKeys(keys.map((k) => k.keyHash));
}

/** Revokes every key issued for an access request, as part of the caller's transaction. */
export async function revokeKeysForRequest(
  accessRequestId: Types.ObjectId,
  session: ClientSession
) {
  await ApiKeyModel.updateMany(
    { accessRequestId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { session }
  );
}
