import { Router } from 'express';

import { AppError } from '../../errors/app-error';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idOrSlugParams } from '../apis/api.schemas';
import { getVisibleApi, type Viewer } from '../apis/api.service';
import { rangeQuery } from './analytics.schemas';
import * as analytics from './analytics.service';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

/** Usage of an API is visible to its owner and to admins only. */
async function managedApi(idOrSlug: string, viewer: Viewer) {
  const api = await getVisibleApi(idOrSlug, viewer);

  if (viewer.role !== 'ADMIN' && api.ownerId !== viewer.id) {
    throw new AppError(403, 'FORBIDDEN', 'Only the owner or an admin can see usage for this API');
  }

  return api;
}

analyticsRouter.get('/me', async (req, res) => {
  const range = rangeQuery.parse(req.query);

  res.json({ success: true, data: await analytics.developerUsage(req.user!.id, range) });
});

analyticsRouter.get(
  '/apis/:idOrSlug/summary',
  authorize('PUBLISHER', 'ADMIN'),
  async (req, res) => {
    const { idOrSlug } = idOrSlugParams.parse(req.params);
    const range = rangeQuery.parse(req.query);
    const api = await managedApi(idOrSlug, req.user!);

    res.json({ success: true, data: await analytics.apiSummary(api._id, range) });
  }
);

analyticsRouter.get(
  '/apis/:idOrSlug/timeseries',
  authorize('PUBLISHER', 'ADMIN'),
  async (req, res) => {
    const { idOrSlug } = idOrSlugParams.parse(req.params);
    const range = rangeQuery.parse(req.query);
    const api = await managedApi(idOrSlug, req.user!);

    res.json({ success: true, data: await analytics.apiTimeseries(api._id, range) });
  }
);
