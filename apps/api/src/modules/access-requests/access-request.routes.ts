import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  accessRequestIdParams,
  approveSchema,
  createAccessRequestSchema,
  listAccessRequestsQuery,
  rejectSchema,
} from './access-request.schemas';
import * as service from './access-request.service';

export const accessRequestsRouter = Router();

accessRequestsRouter.use(authenticate);

accessRequestsRouter.post('/', authorize('DEVELOPER'), async (req, res) => {
  const input = createAccessRequestSchema.parse(req.body);
  const { request, api } = await service.createAccessRequest(input, req.user!);

  res.status(201).json({ success: true, data: service.toAccessRequestResponse(request, api) });
});

accessRequestsRouter.get('/', async (req, res) => {
  const query = listAccessRequestsQuery.parse(req.query);
  const { data, meta } = await service.listAccessRequests(query, req.user!);

  res.json({ success: true, data, meta });
});

accessRequestsRouter.get('/:id', async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const request = await service.getAccessRequest(id, req.user!);
  const apis = await service.apiSummaries([request.apiId]);

  res.json({
    success: true,
    data: service.toAccessRequestResponse(request, apis.get(String(request.apiId))),
  });
});

accessRequestsRouter.post('/:id/approve', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = approveSchema.parse(req.body ?? {});
  const request = await service.transition(id, 'pending', 'approved', req.user!, note);

  res.json({ success: true, data: service.toAccessRequestResponse(request) });
});

accessRequestsRouter.post('/:id/reject', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = rejectSchema.parse(req.body);
  const request = await service.transition(id, 'pending', 'rejected', req.user!, note);

  res.json({ success: true, data: service.toAccessRequestResponse(request) });
});
