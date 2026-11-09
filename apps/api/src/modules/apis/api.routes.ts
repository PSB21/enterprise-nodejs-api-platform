import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { createApiSchema, listApisQuery, updateApiSchema } from './api.schemas';
import * as apiService from './api.service';

export const apisRouter = Router();

apisRouter.use(authenticate);

const idOrSlugParams = z.object({ idOrSlug: z.string().min(1).max(60) });

apisRouter.get('/', async (req, res) => {
  const query = listApisQuery.parse(req.query);
  const { apis, meta } = await apiService.listApis(query, req.user!);

  res.json({
    success: true,
    data: apis.map((api) => apiService.toApiResponse(api, req.user!)),
    meta,
  });
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

  res.json({ success: true, data: apiService.toApiResponse(api, req.user!) });
});
