import type { Role } from '../generated/prisma/enums';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware once the access token has been verified. */
      user?: { id: string; role: Role };
    }
  }
}

export {};
