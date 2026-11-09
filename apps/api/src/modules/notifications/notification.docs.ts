import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { notificationResponseSchema } from '../../docs/schemas';
import { listNotificationsQuery, notificationIdParams } from './notification.routes';

const base = '/api/v1/notifications';

documentRoute({
  method: 'get',
  path: base,
  tag: 'Notifications',
  summary: 'List my notifications',
  description: '`meta.unread` is the total number of unread notifications.',
  auth: true,
  query: listNotificationsQuery,
  responses: {
    200: {
      description: 'A page of notifications, newest first',
      data: z.array(notificationResponseSchema),
      paginated: true,
    },
  },
});

documentRoute({
  method: 'post',
  path: `${base}/read-all`,
  tag: 'Notifications',
  summary: 'Mark all my notifications as read',
  auth: true,
  responses: {
    200: { description: 'Done', data: z.object({ updated: z.number().int() }) },
  },
});

documentRoute({
  method: 'post',
  path: `${base}/:id/read`,
  tag: 'Notifications',
  summary: 'Mark one notification as read',
  auth: true,
  params: notificationIdParams,
  responses: {
    200: { description: 'Marked as read', data: notificationResponseSchema },
    404: { description: 'Not found (NOTIFICATION_NOT_FOUND)' },
  },
});
