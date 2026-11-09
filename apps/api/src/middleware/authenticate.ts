import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../modules/auth/access-token';

/** Requires a valid access token in the `Authorization: Bearer <token>` header. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Log in to use this endpoint');
  }

  req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
  next();
};
