import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { revokeAccessSchema } from '../api-keys/api-key.schemas';
import { invalidateKeysForRequest, revokeKeysForRequest } from '../api-keys/api-key.service';
import type { AccessRequestDocument } from './access-request.model';
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

async function present(request: AccessRequestDocument) {
  const [data] = await service.presentRequests([request]);
  return data;
}

accessRequestsRouter.post('/', authorize('DEVELOPER'), async (req, res) => {
  const input = createAccessRequestSchema.parse(req.body);
  const { request } = await service.createAccessRequest(input, req.user!);

  res.status(201).json({ success: true, data: await present(request) });
});

accessRequestsRouter.get('/', async (req, res) => {
  const query = listAccessRequestsQuery.parse(req.query);
  const { data, meta } = await service.listAccessRequests(query, req.user!);

  res.json({ success: true, data, meta });
});

accessRequestsRouter.get('/:id', async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const request = await service.getAccessRequest(id, req.user!);

  res.json({ success: true, data: await present(request) });
});

accessRequestsRouter.post('/:id/approve', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = approveSchema.parse(req.body ?? {});
  const request = await service.transition(id, 'pending', 'approved', req.user!, note);

  res.json({ success: true, data: await present(request) });
});

accessRequestsRouter.post('/:id/reject', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = rejectSchema.parse(req.body);
  const request = await service.transition(id, 'pending', 'rejected', req.user!, note);

  res.json({ success: true, data: await present(request) });
});

/**
 * Takes away approved access. The status change, revoking every key and the notification all
 * happen in one transaction, so access can never end up revoked while a key still works.
 */
accessRequestsRouter.post('/:id/revoke', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = revokeAccessSchema.parse(req.body);
  const request = await service.transition(
    id,
    'approved',
    'revoked',
    req.user!,
    note,
    (updated, session) => revokeKeysForRequest(updated._id, session)
  );
  // Only after the transaction has committed: clearing the cache earlier could let the
  // gateway re-cache a key that a rolled-back transaction left active.
  await invalidateKeysForRequest(request._id);

  res.json({ success: true, data: await present(request) });
});
