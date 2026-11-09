import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { apiResponseSchema } from '../../docs/schemas';
import { createApiSchema, idOrSlugParams, listApisQuery, updateApiSchema } from './api.schemas';

const base = '/api/v1/apis';

documentRoute({
  method: 'get',
  path: base,
  tag: 'APIs',
  summary: 'Browse the API catalog',
  description:
    'Developers see published APIs. Publishers also see their own drafts. Admins see everything. ' +
    'With `q`, results are ranked by text relevance.',
  auth: true,
  query: listApisQuery,
  responses: {
    200: { description: 'A page of APIs', data: z.array(apiResponseSchema), paginated: true },
  },
});

documentRoute({
  method: 'get',
  path: `${base}/:idOrSlug`,
  tag: 'APIs',
  summary: 'Get one API by id or slug',
  auth: true,
  params: idOrSlugParams,
  responses: {
    200: { description: 'The API', data: apiResponseSchema },
    404: { description: 'Not found, or not visible to this user (API_NOT_FOUND)' },
  },
});

documentRoute({
  method: 'post',
  path: base,
  tag: 'APIs',
  summary: 'Publish a new API',
  auth: true,
  roles: ['PUBLISHER', 'ADMIN'],
  body: createApiSchema,
  responses: {
    201: { description: 'Created', data: apiResponseSchema },
    409: { description: 'Slug already in use (SLUG_TAKEN)' },
  },
});

documentRoute({
  method: 'patch',
  path: `${base}/:idOrSlug`,
  tag: 'APIs',
  summary: 'Update an API',
  description: 'Only the owner or an admin. Fields that are not sent stay unchanged.',
  auth: true,
  roles: ['PUBLISHER', 'ADMIN'],
  params: idOrSlugParams,
  body: updateApiSchema,
  responses: {
    200: { description: 'Updated', data: apiResponseSchema },
    404: { description: 'Not found (API_NOT_FOUND)' },
  },
});
