import { z } from 'zod';

import { documentRoute } from '../docs/registry';

documentRoute({
  method: 'get',
  path: '/api/v1/health',
  tag: 'Health',
  summary: 'Liveness: the process is running',
  responses: { 200: { description: 'Running', data: z.object({ status: z.literal('ok') }) } },
});

documentRoute({
  method: 'get',
  path: '/api/v1/health/ready',
  tag: 'Health',
  summary: 'Readiness: both databases are reachable',
  responses: {
    200: {
      description: 'Ready to serve requests',
      data: z.object({
        status: z.literal('ready'),
        postgres: z.literal('ok'),
        mongodb: z.literal('ok'),
      }),
    },
    503: { description: 'A database is unreachable (DEPENDENCY_UNAVAILABLE)' },
  },
});
