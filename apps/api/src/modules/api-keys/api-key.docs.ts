import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { apiKeyResponseSchema } from '../../docs/schemas';
import { apiKeyIdParams, createApiKeySchema, listApiKeysQuery } from './api-key.schemas';

const base = '/api/v1/api-keys';

documentRoute({
  method: 'post',
  path: base,
  tag: 'API keys',
  summary: 'Create an API key for approved access',
  description:
    'Returns the full key **once**. Only a hash is stored, so it cannot be shown again. ' +
    'Send it to the gateway in the `x-api-key` header.',
  auth: true,
  roles: ['DEVELOPER'],
  body: createApiKeySchema,
  responses: {
    201: {
      description: 'Key created',
      data: z.object({
        key: z.string().describe('The full key, shown only in this response'),
        apiKey: apiKeyResponseSchema,
      }),
    },
    404: { description: 'Access request not found (ACCESS_REQUEST_NOT_FOUND)' },
    409: { description: 'Access not approved, or too many active keys' },
  },
});

documentRoute({
  method: 'get',
  path: base,
  tag: 'API keys',
  summary: 'List my API keys',
  description: 'Shows only the prefix of each key. Admins see all keys.',
  auth: true,
  query: listApiKeysQuery,
  responses: {
    200: { description: 'A page of keys', data: z.array(apiKeyResponseSchema), paginated: true },
  },
});

documentRoute({
  method: 'delete',
  path: `${base}/:id`,
  tag: 'API keys',
  summary: 'Revoke an API key',
  description: 'The gateway rejects the key from now on. Revoking twice is harmless.',
  auth: true,
  params: apiKeyIdParams,
  responses: {
    200: { description: 'Revoked', data: apiKeyResponseSchema },
    404: { description: 'Not found (API_KEY_NOT_FOUND)' },
  },
});
