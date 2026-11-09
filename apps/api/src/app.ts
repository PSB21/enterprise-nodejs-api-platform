import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { apisRouter } from './modules/apis/api.routes';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { healthRouter } from './routes/health.routes';

/** Builds the app without starting a server, so tests can call it directly. */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/apis', apisRouter);

  // Order matters: these two must stay after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
