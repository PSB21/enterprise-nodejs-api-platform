import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { buildOpenApiDocument } from './docs/openapi';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { apiRoutes, gatewayMount } from './routes';

/** Builds the app without starting a server, so tests can call it directly. */
export function createApp() {
  const app = express();
  const openApiDocument = buildOpenApiDocument();

  // Hosting platforms put the app behind a proxy. Trusting one hop makes req.ip the real
  // client address, taken from X-Forwarded-For, instead of the proxy's address.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  // The gateway comes before the JSON parser: it needs request bodies as untouched bytes.
  app.use(gatewayMount.path, gatewayMount.router);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  for (const { path, router } of apiRoutes) {
    app.use(path, router);
  }

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    // Swagger UI needs inline styles and data: images, which the default policy blocks.
    helmet.contentSecurityPolicy({
      directives: { styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'API Management System docs' })
  );

  // Order matters: these two must stay after all routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
