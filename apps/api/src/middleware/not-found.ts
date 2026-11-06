import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';

export const notFound: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`);
};
