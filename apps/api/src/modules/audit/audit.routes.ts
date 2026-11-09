import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { EVENT_TYPES } from '../../events/types';
import { pageMeta, paginationSchema, toSkip } from '../../lib/pagination';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

export const auditRouter = Router();

auditRouter.use(authenticate, authorize('ADMIN'));

export const listAuditLogsQuery = paginationSchema.extend({
  type: z.enum(EVENT_TYPES).optional(),
  actorId: z.uuid().optional(),
});

auditRouter.get('/', async (req, res) => {
  const query = listAuditLogsQuery.parse(req.query);
  const where = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: toSkip(query),
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    success: true,
    data: logs.map((log) => ({
      id: log.id,
      eventId: log.eventId,
      type: log.type,
      actorId: log.actorId,
      subject: { type: log.subjectType, id: log.subjectId },
      data: log.data,
      occurredAt: log.occurredAt,
    })),
    meta: pageMeta(query, total),
  });
});
