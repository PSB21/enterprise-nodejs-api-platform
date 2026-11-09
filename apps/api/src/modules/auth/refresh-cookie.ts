import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env';

export const REFRESH_COOKIE = 'ams_refresh';

function cookieOptions(): CookieOptions {
  return {
    // JavaScript in the page cannot read it, so a cross-site scripting bug cannot steal it.
    httpOnly: true,
    // HTTPS only in production. Local development runs on plain http://localhost.
    secure: env.NODE_ENV === 'production',
    // The browser will not send it on requests started by other sites, which blocks CSRF.
    sameSite: 'strict',
    // Sent only to the auth endpoints, not with every API call.
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
