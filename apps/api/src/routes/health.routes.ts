import { Router } from 'express';

import { pingMongo } from '../db/mongo';
import { prisma } from '../db/prisma';
import { AppError } from '../errors/app-error';

export const healthRouter = Router();

/** Liveness: the process is running. Deliberately touches nothing else. */
healthRouter.get('/', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

async function check(name: string, probe: () => Promise<unknown>) {
  try {
    await probe();
    return true;
  } catch (err) {
    console.error(`Readiness check failed for ${name}:`, err);
    return false;
  }
}

/** Readiness: the API can reach what it depends on, so it can serve real requests. */
healthRouter.get('/ready', async (_req, res) => {
  // Both checks run at the same time, so the slower one sets the response time.
  const [postgres, mongo] = await Promise.all([
    check('postgres', () => prisma.$queryRaw`SELECT 1`),
    check('mongodb', pingMongo),
  ]);

  if (!postgres || !mongo) {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'A database is not reachable', {
      postgres: postgres ? 'ok' : 'unavailable',
      mongodb: mongo ? 'ok' : 'unavailable',
    });
  }

  res.json({ success: true, data: { status: 'ready', postgres: 'ok', mongodb: 'ok' } });
});
