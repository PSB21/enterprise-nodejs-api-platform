import request from 'supertest';

import { createApp } from '../src/app';
import { toOpenApiPath } from '../src/docs/openapi';
import { apiRoutes } from '../src/routes';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Lists every real route as "METHOD /path", read from the Express routers themselves. */
function mountedRoutes() {
  const found: string[] = [];

  for (const { path, router } of apiRoutes) {
    for (const layer of router.stack as RouteLayer[]) {
      if (!layer.route) continue; // middleware, not a route
      const full = toOpenApiPath(`${path}${layer.route.path === '/' ? '' : layer.route.path}`);
      for (const method of Object.keys(layer.route.methods)) {
        found.push(`${method.toUpperCase()} ${full}`);
      }
    }
  }

  return found.sort();
}

describe('OpenAPI document', () => {
  const app = createApp();

  async function documentedRoutes() {
    const res = await request(app).get('/api/docs/openapi.json');
    const paths = res.body.paths as Record<string, Record<string, unknown>>;
    return Object.entries(paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
  }

  it('documents every route, and only routes that exist', async () => {
    expect(await documentedRoutes()).toEqual(mountedRoutes());
  });

  it('is an OpenAPI 3.1 document with security schemes', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.components.securitySchemes)).toEqual([
      'bearerAuth',
      'refreshCookie',
    ]);
  });

  it('derives request rules from the validation schemas', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    const register = res.body.paths['/api/v1/auth/register'].post;
    const body = register.requestBody.content['application/json'].schema;
    const listApis = res.body.paths['/api/v1/apis'].get;

    expect(body.required).toEqual(['name', 'email', 'password']);
    expect(body.properties.password.minLength).toBe(8);
    expect(listApis.parameters.find((p: { name: string }) => p.name === 'limit')).toMatchObject({
      in: 'query',
      required: false,
    });
  });

  it('adds the 401 and 403 responses that protected routes can return', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    const createApi = res.body.paths['/api/v1/apis'].post;

    expect(Object.keys(createApi.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '409'])
    );
    expect(createApi.security).toEqual([{ bearerAuth: [] }]);
  });

  it('serves the Swagger UI page', async () => {
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
