import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface ResponseDoc {
  description: string;
  /** Schema of `data` in the success envelope. Leave out for responses with no body. */
  data?: z.ZodType;
  /** Adds the `meta` paging block to the envelope. */
  paginated?: boolean;
}

export interface RouteDoc {
  method: HttpMethod;
  /** Full Express path, for example /api/v1/apis/:idOrSlug */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Requires `Authorization: Bearer <access token>`. */
  auth?: boolean;
  /** Roles allowed; documented, and implies a possible 403. */
  roles?: string[];
  /** Uses the refresh token cookie. */
  refreshCookie?: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  responses: Record<number, ResponseDoc>;
}

const routes: RouteDoc[] = [];

/** Records how a route works, using the same Zod schemas the route uses to validate input. */
export function documentRoute(doc: RouteDoc) {
  routes.push(doc);
}

export function documentedRoutes(): readonly RouteDoc[] {
  return routes;
}
