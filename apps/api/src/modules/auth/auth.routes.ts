import { Router } from 'express';

import { AppError } from '../../errors/app-error';
import { authenticate } from '../../middleware/authenticate';
import { loginRateLimit } from '../../middleware/login-rate-limit';
import { toPublicUser } from '../users/user.dto';
import { signAccessToken } from './access-token';
import { loginSchema, registerSchema } from './auth.schemas';
import * as authService from './auth.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { issueRefreshToken, revokeByToken, rotateRefreshToken } from './refresh-token';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await authService.register(input);

  res.status(201).json({ success: true, data: { user } });
});

authRouter.post('/login', loginRateLimit, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authService.login(input);
  const refresh = await issueRefreshToken(user.id);

  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  res.json({
    success: true,
    data: { accessToken: signAccessToken(user), user: toPublicUser(user) },
  });
});

/** Swaps the refresh cookie for a new access token and a new refresh cookie. */
authRouter.post('/refresh', async (req, res) => {
  const token = readRefreshCookie(req);

  if (!token) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Please log in again');
  }

  try {
    const { user, token: next, expiresAt } = await rotateRefreshToken(token);

    setRefreshCookie(res, next, expiresAt);
    res.json({
      success: true,
      data: { accessToken: signAccessToken(user), user: toPublicUser(user) },
    });
  } catch (err) {
    // A cookie that no longer works is useless to the browser, so remove it.
    clearRefreshCookie(res);
    throw err;
  }
});

/**
 * Ends this login. The access token stays valid until it expires (at most 15 minutes), which
 * is the trade-off for not checking the database on every request.
 */
authRouter.post('/logout', async (req, res) => {
  const token = readRefreshCookie(req);

  if (token) {
    await revokeByToken(token);
  }

  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  // Read from the database rather than the token, so the reply reflects any recent changes.
  const user = await authService.getUserById(req.user!.id);

  res.json({ success: true, data: { user: toPublicUser(user) } });
});
