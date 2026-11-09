import { Router } from 'express';

import { prisma } from '../db/prisma';
import { AppError } from '../errors/app-error';

export const healthRouter = Router();

/** Liveness: the process is running. Deliberately touches nothing else. */
healthRouter.get('/', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

/** Readiness: the API can reach what it depends on, so it can serve real requests. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error('Readiness check failed:', err);
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is not reachable');
  }

  res.json({ success: true, data: { status: 'ready', postgres: 'ok' } });
});
