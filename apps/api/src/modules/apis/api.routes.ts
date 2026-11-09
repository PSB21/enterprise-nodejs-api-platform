import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { invalidateApi } from '../gateway/gateway.service';
import { createApiSchema, idOrSlugParams, listApisQuery, updateApiSchema } from './api.schemas';
import * as apiService from './api.service';

export const apisRouter = Router();

apisRouter.use(authenticate);

apisRouter.get('/', async (req, res) => {
  const query = listApisQuery.parse(req.query);
  const { apis, meta } = await apiService.listApis(query, req.user!);

  res.json({
    success: true,
    data: apis.map((api) => apiService.toApiResponse(api, req.user!)),
    meta,
  });
});

// Must come before /:idOrSlug, or "tags" would be treated as an API's slug.
apisRouter.get('/tags', async (req, res) => {
  res.json({ success: true, data: await apiService.listTags(req.user!) });
});

apisRouter.get('/:idOrSlug', async (req, res) => {
  const { idOrSlug } = idOrSlugParams.parse(req.params);
  const api = await apiService.getVisibleApi(idOrSlug, req.user!);

  res.json({ success: true, data: apiService.toApiResponse(api, req.user!) });
});

apisRouter.post('/', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const input = createApiSchema.parse(req.body);
  const api = await apiService.createApi(input, req.user!);

  res.status(201).json({ success: true, data: apiService.toApiResponse(api, req.user!) });
});

apisRouter.patch('/:idOrSlug', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { idOrSlug } = idOrSlugParams.parse(req.params);
  const input = updateApiSchema.parse(req.body);
  const api = await apiService.updateApi(idOrSlug, input, req.user!);
  // The gateway caches APIs by slug; clear it so a status or upstream change applies at once.
  await invalidateApi(api.slug);

  res.json({ success: true, data: apiService.toApiResponse(api, req.user!) });
});
