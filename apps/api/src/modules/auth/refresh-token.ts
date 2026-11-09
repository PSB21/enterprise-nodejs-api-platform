import crypto from 'node:crypto';

import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import { randomSecret, sha256 } from '../../lib/hash';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Issues a new refresh token. Pass a familyId to continue an existing login. */
export async function issueRefreshToken(userId: string, familyId: string = crypto.randomUUID()) {
  const token = randomSecret();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: sha256(token), expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Swaps a refresh token for a new one (rotation). Each token works exactly once.
 *
 * If a token that was already used comes back, either the real user or an attacker holds a
 * copy, and we cannot tell which. So the whole login (the token family) is revoked, and both
 * must log in again.
 */
export async function rotateRefreshToken(token: string) {
  const current = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!current) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Please log in again');
  }

  if (current.revokedAt) {
    await revokeFamily(current.familyId);
    throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'Please log in again');
  }

  if (current.expiresAt <= new Date()) {
    throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Please log in again');
  }

  // The `revokedAt: null` condition makes this a compare-and-set: if two requests use the same
  // token at once, only one of them can update the row.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: current.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    await revokeFamily(current.familyId);
    throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'Please log in again');
  }

  const next = await issueRefreshToken(current.userId, current.familyId);
  return { user: current.user, ...next };
}

export async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Logs out the session that owns this token. Unknown tokens are ignored. */
export async function revokeByToken(token: string) {
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });

  if (current) {
    await revokeFamily(current.familyId);
  }
}

/** Ends every session for a user, for example after their role changes. */
export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
