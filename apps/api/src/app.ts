import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { authRouter } from './modules/auth/auth.routes';
import { healthRouter } from './routes/health.routes';

/** Builds the app without starting a server, so tests can call it directly. */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);

  // Order matters: these two must stay after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
