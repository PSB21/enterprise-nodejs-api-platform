import type { Router } from 'express';

import { apisRouter } from '../modules/apis/api.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.routes';
import { healthRouter } from './health.routes';

/**
 * Every API router and where it is mounted. Kept as data so the documentation test can list
 * every real route and check that each one is documented.
 */
export const apiRoutes: { path: string; router: Router }[] = [
  { path: '/api/v1/health', router: healthRouter },
  { path: '/api/v1/auth', router: authRouter },
  { path: '/api/v1/users', router: usersRouter },
  { path: '/api/v1/apis', router: apisRouter },
];
