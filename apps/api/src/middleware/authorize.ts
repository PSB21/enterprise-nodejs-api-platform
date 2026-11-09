import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error';
import type { Role } from '../generated/prisma/enums';

/**
 * Allows only the given roles. Must run after `authenticate`.
 *
 * 401 means "we don't know who you are"; 403 means "we know, and you may not do this".
 */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Log in to use this endpoint');
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }

    next();
  };
}
