import { z } from 'zod';

import { documentedRoutes, type ResponseDoc, type RouteDoc } from './registry';
import { errorSchema, pageMetaSchema } from './schemas';

// Importing these runs their documentRoute() calls.
import '../modules/auth/auth.docs';
import '../modules/users/users.docs';
import '../modules/apis/api.docs';
import '../modules/access-requests/access-request.docs';
import '../modules/notifications/notification.docs';
import '../modules/api-keys/api-key.docs';
import '../modules/gateway/gateway.docs';
import '../modules/analytics/analytics.docs';
import '../modules/mock-upstream/mock-orders.docs';
import '../routes/health.docs';

type JsonSchema = Record<string, unknown>;

/** Converts a Zod schema to JSON Schema, the format OpenAPI 3.1 uses. */
function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema;
  delete json.$schema;
  return json;
}

function parameters(schema: z.ZodObject | undefined, location: 'path' | 'query') {
  if (!schema) return [];

  return Object.entries(schema.shape).map(([name, field]) => {
    const json = toJsonSchema(field as z.ZodType, 'input');
    return {
      name,
      in: location,
      // A field that accepts "nothing" (optional or with a default) is not required.
      required: location === 'path' || !(field as z.ZodType).safeParse(undefined).success,
      ...(typeof json.description === 'string' ? { description: json.description } : {}),
      schema: json,
    };
  });
}

function successBody(response: ResponseDoc) {
  if (!response.data) return undefined;

  const envelope = z.object({
    success: z.literal(true),
    data: response.data,
    ...(response.paginated ? { meta: pageMetaSchema } : {}),
  });

  return { 'application/json': { schema: toJsonSchema(envelope, 'output') } };
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

function operation(route: RouteDoc) {
  const responses: Record<string, unknown> = {};

  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] =
      Number(status) >= 400
        ? errorResponse(response.description)
        : { description: response.description, content: successBody(response) };
  }

  // Errors every route of a given kind can return, so each route need not repeat them.
  if ((route.body || route.query || route.params) && !responses[400]) {
    responses[400] = errorResponse('Invalid request (VALIDATION_ERROR)');
  }
  if (route.auth && !responses[401]) {
    responses[401] = errorResponse('Missing, invalid or expired access token');
  }
  if (route.roles && !responses[403]) {
    responses[403] = errorResponse(`Only for: ${route.roles.join(', ')}`);
  }

  const security = [
    ...(route.auth ? [{ bearerAuth: [] }] : []),
    ...(route.refreshCookie ? [{ refreshCookie: [] }] : []),
  ];

  return {
    tags: [route.tag],
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    ...(route.roles ? { 'x-roles': route.roles } : {}),
    ...(security.length ? { security } : {}),
    parameters: [...parameters(route.params, 'path'), ...parameters(route.query, 'query')],
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toJsonSchema(route.body, 'input') } },
          },
        }
      : {}),
    responses,
  };
}

/**
 * Express writes path parameters as `:id` and an optional wildcard as `{/*path}`;
 * OpenAPI writes both as `{name}`.
 */
export function toOpenApiPath(path: string) {
  return path.replace(/\{\/\*(\w+)\}/g, '/{$1}').replace(/:(\w+)/g, '{$1}');
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of documentedRoutes()) {
    const path = toOpenApiPath(route.path);
    paths[path] ??= {};
    paths[path][route.method] = operation(route);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'API Management System',
      version: '1.0.0',
      description:
        'Publishers list APIs, developers request access and receive API keys, and a gateway ' +
        'enforces those keys and records usage. Every response uses the envelope ' +
        '`{ success, data }` or `{ success: false, error }`.',
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'ams_refresh' },
      },
      schemas: { Error: toJsonSchema(errorSchema, 'output') },
    },
    paths,
  };
}
