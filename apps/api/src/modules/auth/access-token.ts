import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { Role } from '../../generated/prisma/enums';
import { AppError } from '../../errors/app-error';

interface AccessTokenClaims {
  sub: string;
  role: Role;
}

const ROLES = new Set<string>(Object.values(Role));

export function signAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): { id: string; role: Role } {
  let claims: AccessTokenClaims;

  try {
    // Pinning the algorithm stops a forged token from choosing a weaker one, such as "none".
    claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenClaims;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // A distinct code tells the frontend to refresh the token rather than log the user out.
      throw new AppError(401, 'TOKEN_EXPIRED', 'The access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'The access token is invalid');
  }

  if (typeof claims.sub !== 'string' || !ROLES.has(claims.role)) {
    throw new AppError(401, 'INVALID_TOKEN', 'The access token is invalid');
  }

  return { id: claims.sub, role: claims.role };
}
