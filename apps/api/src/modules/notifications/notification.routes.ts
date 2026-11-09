import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../errors/app-error';
import { pageMeta, paginationSchema, toSkip } from '../../lib/pagination';
import { authenticate } from '../../middleware/authenticate';
import { objectIdSchema } from '../apis/api.schemas';
import { NotificationModel, toNotificationResponse } from './notification.model';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

export const listNotificationsQuery = paginationSchema.extend({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export const notificationIdParams = z.object({ id: objectIdSchema });

notificationsRouter.get('/', async (req, res) => {
  const query = listNotificationsQuery.parse(req.query);
  const filter = { userId: req.user!.id, ...(query.unread ? { readAt: null } : {}) };

  const [items, total, unread] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId: req.user!.id, readAt: null }),
  ]);

  res.json({
    success: true,
    data: items.map(toNotificationResponse),
    meta: { ...pageMeta(query, total), unread },
  });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const { modifiedCount } = await NotificationModel.updateMany(
    { userId: req.user!.id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  res.json({ success: true, data: { updated: modifiedCount } });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const { id } = notificationIdParams.parse(req.params);

  // Filtering by userId as well as id means users can only touch their own notifications.
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: id, userId: req.user!.id },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  }

  res.json({ success: true, data: toNotificationResponse(notification) });
});
