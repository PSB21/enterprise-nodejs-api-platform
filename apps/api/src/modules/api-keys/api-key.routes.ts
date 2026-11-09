import { Router } from 'express';

import { publishEvent } from '../../events/bus';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { apiSummaries } from '../access-requests/access-request.service';
import type { ApiKeyDocument } from './api-key.model';
import { apiKeyIdParams, createApiKeySchema, listApiKeysQuery } from './api-key.schemas';
import * as service from './api-key.service';

export const apiKeysRouter = Router();

apiKeysRouter.use(authenticate);

// Audit data names the key by its prefix only; the key itself never leaves the response.
const auditData = (key: ApiKeyDocument) => ({
  name: key.name,
  prefix: key.prefix,
  apiId: String(key.apiId),
  developerId: key.developerId,
});

apiKeysRouter.post('/', authorize('DEVELOPER'), async (req, res) => {
  const { accessRequestId, name } = createApiKeySchema.parse(req.body);
  const { key, apiKey } = await service.createApiKey(accessRequestId, name, req.user!);
  const apis = await apiSummaries([apiKey.apiId]);

  await publishEvent({
    type: 'api-key.created',
    actorId: req.user!.id,
    subject: { type: 'api-key', id: apiKey.id as string },
    data: auditData(apiKey),
  });

  // Tell browsers and proxies not to keep a copy of the response holding the secret.
  res.set('Cache-Control', 'no-store');
  res.status(201).json({
    success: true,
    data: { key, apiKey: service.toApiKeyResponse(apiKey, apis.get(String(apiKey.apiId))) },
  });
});

apiKeysRouter.get('/', async (req, res) => {
  const query = listApiKeysQuery.parse(req.query);
  const { data, meta } = await service.listApiKeys(query, req.user!);

  res.json({ success: true, data, meta });
});

apiKeysRouter.delete('/:id', async (req, res) => {
  const { id } = apiKeyIdParams.parse(req.params);
  const key = await service.revokeApiKey(id, req.user!);

  await publishEvent({
    type: 'api-key.revoked',
    actorId: req.user!.id,
    subject: { type: 'api-key', id: key.id as string },
    data: auditData(key),
  });

  res.json({ success: true, data: service.toApiKeyResponse(key) });
});
