import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { apiSummaries } from '../access-requests/access-request.service';
import { apiKeyIdParams, createApiKeySchema, listApiKeysQuery } from './api-key.schemas';
import * as service from './api-key.service';

export const apiKeysRouter = Router();

apiKeysRouter.use(authenticate);

apiKeysRouter.post('/', authorize('DEVELOPER'), async (req, res) => {
  const { accessRequestId, name } = createApiKeySchema.parse(req.body);
  const { key, apiKey } = await service.createApiKey(accessRequestId, name, req.user!);
  const apis = await apiSummaries([apiKey.apiId]);

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

  res.json({ success: true, data: service.toApiKeyResponse(key) });
});
