import { AccessRequestModel } from '../../src/modules/access-requests/access-request.model';
import type { ApiDocument } from '../../src/modules/apis/api.model';
import { ApiKeyModel } from '../../src/modules/api-keys/api-key.model';
import { generateApiKey } from '../../src/modules/api-keys/api-key.service';

/** Creates an approved access request directly in the database. */
export function approveAccess(api: ApiDocument, developerId: string, planName = 'Free') {
  const now = new Date();
  return AccessRequestModel.create({
    apiId: api._id,
    apiOwnerId: api.ownerId,
    developerId,
    planName,
    useCase: 'Testing the integration end to end.',
    status: 'approved',
    reviewedBy: api.ownerId,
    reviewedAt: now,
    history: [
      { status: 'pending', by: developerId, at: now },
      { status: 'approved', by: api.ownerId, at: now },
    ],
  });
}

/** Creates an approved request and a working key; returns the raw key. */
export async function issueKey(api: ApiDocument, developerId: string, planName = 'Free') {
  const request = await approveAccess(api, developerId, planName);
  const { key, prefix, keyHash } = generateApiKey();
  const apiKey = await ApiKeyModel.create({
    accessRequestId: request._id,
    apiId: api._id,
    developerId,
    planName,
    name: 'Test key',
    prefix,
    keyHash,
  });
  return { key, apiKey, request };
}
