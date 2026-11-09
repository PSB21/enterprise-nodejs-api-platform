import type { Router } from 'express';

import { accessRequestsRouter } from '../modules/access-requests/access-request.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { apisRouter } from '../modules/apis/api.routes';
import { apiKeysRouter } from '../modules/api-keys/api-key.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { gatewayRouter } from '../modules/gateway/gateway.routes';
import { mockOrdersRouter } from '../modules/mock-upstream/mock-orders.routes';
import { notificationsRouter } from '../modules/notifications/notification.routes';
import { usersRouter } from '../modules/users/users.routes';
import { healthRouter } from './health.routes';

interface Mount {
  path: string;
  router: Router;
}

/**
 * Every router and where it is mounted. Kept as data so the documentation test can list
 * every real route and check that each one is documented.
 */
export const apiRoutes: Mount[] = [
  { path: '/api/v1/health', router: healthRouter },
  { path: '/api/v1/auth', router: authRouter },
  { path: '/api/v1/users', router: usersRouter },
  { path: '/api/v1/apis', router: apisRouter },
  { path: '/api/v1/access-requests', router: accessRequestsRouter },
  { path: '/api/v1/notifications', router: notificationsRouter },
  { path: '/api/v1/api-keys', router: apiKeysRouter },
  { path: '/api/v1/analytics', router: analyticsRouter },
  { path: '/mock/orders', router: mockOrdersRouter },
];

/** Mounted separately, before the JSON body parser, because it forwards raw bodies. */
export const gatewayMount: Mount = { path: '/gateway', router: gatewayRouter };
