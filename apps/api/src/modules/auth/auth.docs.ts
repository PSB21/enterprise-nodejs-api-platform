import { z } from 'zod';

import { documentRoute } from '../../docs/registry';
import { publicUserSchema, sessionSchema } from '../../docs/schemas';
import { loginSchema, registerSchema } from './auth.schemas';

const base = '/api/v1/auth';

documentRoute({
  method: 'post',
  path: `${base}/register`,
  tag: 'Auth',
  summary: 'Create an account',
  description: 'New accounts are always DEVELOPER. Only an admin can change a role.',
  body: registerSchema,
  responses: {
    201: { description: 'Account created', data: z.object({ user: publicUserSchema }) },
    409: { description: 'Email already registered (EMAIL_TAKEN)' },
  },
});

documentRoute({
  method: 'post',
  path: `${base}/login`,
  tag: 'Auth',
  summary: 'Log in',
  description: 'Returns a 15-minute access token and sets the refresh token as an httpOnly cookie.',
  body: loginSchema,
  responses: {
    200: { description: 'Logged in', data: sessionSchema },
    401: { description: 'Wrong email or password (INVALID_CREDENTIALS)' },
    429: { description: 'More than 10 attempts in 15 minutes (TOO_MANY_ATTEMPTS)' },
  },
});

documentRoute({
  method: 'post',
  path: `${base}/refresh`,
  tag: 'Auth',
  summary: 'Get a new access token',
  description:
    'Uses the refresh cookie once and replaces it. Reusing an old cookie ends the whole login.',
  refreshCookie: true,
  responses: {
    200: { description: 'New access token issued', data: sessionSchema },
    401: { description: 'Missing, expired or reused refresh token' },
  },
});

documentRoute({
  method: 'post',
  path: `${base}/logout`,
  tag: 'Auth',
  summary: 'Log out',
  refreshCookie: true,
  responses: { 204: { description: 'Logged out; the refresh cookie is cleared' } },
});

documentRoute({
  method: 'get',
  path: `${base}/me`,
  tag: 'Auth',
  summary: 'Get the logged-in user',
  auth: true,
  responses: { 200: { description: 'Current user', data: z.object({ user: publicUserSchema }) } },
});
