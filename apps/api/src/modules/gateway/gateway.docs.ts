import { z } from 'zod';

import { documentRoute, type HttpMethod } from '../../docs/registry';

const params = z.object({
  slug: z.string().describe('The API slug from the catalog'),
  path: z.string().describe('Any path on the upstream API, for example `orders/42`'),
});

for (const method of ['get', 'post', 'put', 'patch', 'delete'] as HttpMethod[]) {
  documentRoute({
    method,
    path: '/gateway/:slug{/*path}',
    tag: 'Gateway',
    summary: `Call an API through the gateway (${method.toUpperCase()})`,
    description:
      'Send your key in the `x-api-key` header. The request is forwarded to the API with its ' +
      'path, query string and body; the response comes back unchanged. Every call is logged ' +
      'for usage analytics. Deprecated APIs add a `Deprecation: true` header. Responses carry ' +
      '`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (seconds).',
    params,
    responses: {
      200: { description: "The upstream API's response, passed through" },
      400: { description: 'Path not allowed (INVALID_PATH)' },
      401: { description: 'Missing, invalid or revoked API key' },
      403: { description: 'The key belongs to a different API (KEY_NOT_VALID_FOR_API)' },
      404: { description: 'No such API, or it is not published (API_NOT_FOUND)' },
      429: {
        description:
          "The plan's per-minute limit (RATE_LIMITED, with Retry-After) or monthly quota (QUOTA_EXCEEDED) is used up",
      },
      502: { description: 'The upstream could not be reached (UPSTREAM_UNAVAILABLE)' },
      504: { description: 'The upstream timed out (UPSTREAM_TIMEOUT)' },
    },
  });
}
