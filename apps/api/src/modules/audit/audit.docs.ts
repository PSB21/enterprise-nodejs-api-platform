import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { EVENT_TYPES } from '../../events/types';
import { listAuditLogsQuery } from './audit.routes';

documentRoute({
  method: 'get',
  path: '/api/v1/audit-logs',
  tag: 'Audit',
  summary: 'List the audit log',
  description:
    'Every significant action, newest first: access decisions, key creation and revocation, ' +
    'role changes and quota warnings. Written by the event worker, so entries can appear a ' +
    'moment after the action.',
  auth: true,
  roles: ['ADMIN'],
  query: listAuditLogsQuery,
  responses: {
    200: {
      description: 'A page of audit entries',
      paginated: true,
      data: z.array(
        z.object({
          id: z.uuid(),
          eventId: z.uuid(),
          type: z.enum(EVENT_TYPES),
          actorId: z.uuid().nullable(),
          subject: z.object({ type: z.string(), id: z.string() }),
          data: z.record(z.string(), z.unknown()),
          occurredAt: z.iso.datetime(),
        })
      ),
    },
  },
});
