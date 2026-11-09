import type { RequestHandler } from 'express';

import { env } from '../config/env';
import { AppError } from '../errors/app-error';
import { getRateLimiter } from '../lib/rate-limiter';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/**
 * Slows down password guessing: at most 10 login attempts per 15 minutes for each pair of
 * client address and email.
 *
 * Keying on the pair means an attacker cannot lock a real user out of their account from
 * another address. The limit is not airtight: an attacker with many addresses gets 10 tries
 * from each, which is one reason passwords are also hashed with slow bcrypt.
 */
export const loginRateLimit: RequestHandler = async (req, res, next) => {
  if (!env.RATE_LIMIT_ENABLED) return next();

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const decision = await getRateLimiter().consume(
    `rl:login:${req.ip}:${email}`,
    MAX_ATTEMPTS,
    WINDOW_MS
  );

  if (!decision.allowed) {
    res.set('Retry-After', String(decision.resetSeconds));
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many login attempts. Try again later.');
  }

  next();
};
