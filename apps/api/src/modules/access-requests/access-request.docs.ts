import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { accessRequestResponseSchema } from '../../docs/schemas';
import {
  accessRequestIdParams,
  approveSchema,
  createAccessRequestSchema,
  listAccessRequestsQuery,
  rejectSchema,
} from './access-request.schemas';

const base = '/api/v1/access-requests';

documentRoute({
  method: 'post',
  path: base,
  tag: 'Access requests',
  summary: 'Request access to an API',
  description: 'One pending or approved request per developer and API.',
  auth: true,
  roles: ['DEVELOPER'],
  body: createAccessRequestSchema,
  responses: {
    201: { description: 'Request created, waiting for review', data: accessRequestResponseSchema },
    404: { description: 'API not found (API_NOT_FOUND)' },
    409: { description: 'Already requested (ACCESS_ALREADY_REQUESTED)' },
  },
});

documentRoute({
  method: 'get',
  path: base,
  tag: 'Access requests',
  summary: 'List access requests',
  description:
    'Developers see their own, publishers see requests for their APIs (their review queue), and admins see all.',
  auth: true,
  query: listAccessRequestsQuery,
  responses: {
    200: {
      description: 'A page of requests',
      data: z.array(accessRequestResponseSchema),
      paginated: true,
    },
  },
});

documentRoute({
  method: 'get',
  path: `${base}/:id`,
  tag: 'Access requests',
  summary: 'Get one access request, with its history',
  auth: true,
  params: accessRequestIdParams,
  responses: {
    200: { description: 'The request', data: accessRequestResponseSchema },
    404: { description: 'Not found or not visible (ACCESS_REQUEST_NOT_FOUND)' },
  },
});

for (const [action, body, summary] of [
  ['approve', approveSchema, 'Approve a pending request'],
  ['reject', rejectSchema, 'Reject a pending request (a note is required)'],
] as const) {
  documentRoute({
    method: 'post',
    path: `${base}/:id/${action}`,
    tag: 'Access requests',
    summary,
    description: 'Saves the decision and notifies the developer in a single transaction.',
    auth: true,
    roles: ['PUBLISHER', 'ADMIN'],
    params: accessRequestIdParams,
    body,
    responses: {
      200: { description: 'Updated', data: accessRequestResponseSchema },
      404: { description: 'Not found (ACCESS_REQUEST_NOT_FOUND)' },
      409: { description: 'The request is not pending (INVALID_STATUS)' },
    },
  });
}
