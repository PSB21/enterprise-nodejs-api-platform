import { Router } from 'express';

import { publishEvent } from '../../events/bus';
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
  return data!;
}

/** Records a decision as an event, after it has been committed. */
function decided(request: AccessRequestDocument, actorId: string, note?: string) {
  return publishEvent({
    type: `access-request.${request.status}` as 'access-request.approved',
    actorId,
    subject: { type: 'access-request', id: request.id as string },
    data: { apiId: String(request.apiId), developerId: request.developerId, note: note ?? null },
  });
}

accessRequestsRouter.post('/', authorize('DEVELOPER'), async (req, res) => {
  const input = createAccessRequestSchema.parse(req.body);
  const { request, api } = await service.createAccessRequest(input, req.user!);
  const data = await present(request);

  // Tells the API's owner there is something to review (handled by the event worker).
  await publishEvent({
    type: 'access-request.created',
    actorId: req.user!.id,
    subject: { type: 'access-request', id: data.id },
    data: {
      apiId: api.id,
      apiName: api.name,
      apiOwnerId: request.apiOwnerId,
      planName: request.planName,
      developerName: data.developer?.name ?? 'A developer',
    },
  });

  res.status(201).json({ success: true, data });
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
  await decided(request, req.user!.id, note);

  res.json({ success: true, data: await present(request) });
});

accessRequestsRouter.post('/:id/reject', authorize('PUBLISHER', 'ADMIN'), async (req, res) => {
  const { id } = accessRequestIdParams.parse(req.params);
  const { note } = rejectSchema.parse(req.body);
  const request = await service.transition(id, 'pending', 'rejected', req.user!, note);
  await decided(request, req.user!.id, note);

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
  await decided(request, req.user!.id, note);

  res.json({ success: true, data: await present(request) });
});
