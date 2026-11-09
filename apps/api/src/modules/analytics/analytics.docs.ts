import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { idOrSlugParams } from '../apis/api.schemas';
import { rangeQueryDoc } from './analytics.schemas';

const range = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });
const point = z.object({
  at: z.iso.datetime(),
  requests: z.number().int(),
  clientErrors: z.number().int(),
  serverErrors: z.number().int(),
  avgLatencyMs: z.number().nullable(),
});
const series = z.object({ interval: z.enum(['hour', 'day']), points: z.array(point) });

documentRoute({
  method: 'get',
  path: '/api/v1/analytics/me',
  tag: 'Analytics',
  summary: 'My usage, per API and over time',
  auth: true,
  query: rangeQueryDoc,
  responses: {
    200: {
      description: 'Usage for the logged-in user',
      data: z.object({
        range,
        apis: z.array(
          z.object({
            api: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
            requests: z.number().int(),
            clientErrors: z.number().int(),
            serverErrors: z.number().int(),
            avgLatencyMs: z.number().nullable(),
          })
        ),
        timeseries: series,
      }),
    },
  },
});

documentRoute({
  method: 'get',
  path: '/api/v1/analytics/apis/:idOrSlug/summary',
  tag: 'Analytics',
  summary: 'Usage summary for one API',
  description:
    'Totals, error rate (5xx as a percentage), average and 95th percentile latency, responses ' +
    'by status code and the top 5 consumers. Owner or admin only.',
  auth: true,
  roles: ['PUBLISHER', 'ADMIN'],
  params: idOrSlugParams,
  query: rangeQueryDoc,
  responses: {
    200: {
      description: 'Summary',
      data: z.object({
        range,
        requests: z.number().int(),
        clientErrors: z.number().int(),
        serverErrors: z.number().int(),
        errorRate: z.number(),
        avgLatencyMs: z.number().nullable(),
        p95LatencyMs: z.number().nullable(),
        byStatus: z.array(z.object({ statusCode: z.number().int(), count: z.number().int() })),
        topConsumers: z.array(
          z.object({
            developerId: z.uuid(),
            name: z.string().nullable(),
            email: z.string().nullable(),
            requests: z.number().int(),
          })
        ),
      }),
    },
    404: { description: 'API not found (API_NOT_FOUND)' },
  },
});

documentRoute({
  method: 'get',
  path: '/api/v1/analytics/apis/:idOrSlug/timeseries',
  tag: 'Analytics',
  summary: 'Requests, errors and latency over time for one API',
  description: 'Buckets with no traffic are included as zeros. Owner or admin only.',
  auth: true,
  roles: ['PUBLISHER', 'ADMIN'],
  params: idOrSlugParams,
  query: rangeQueryDoc,
  responses: {
    200: { description: 'Time series', data: series },
    404: { description: 'API not found (API_NOT_FOUND)' },
  },
});
