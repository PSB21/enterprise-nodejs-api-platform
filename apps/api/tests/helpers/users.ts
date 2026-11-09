import request from 'supertest';
import type { Express } from 'express';

import { prisma } from '../../src/db/prisma';
import type { Role } from '../../src/generated/prisma/enums';
import { signAccessToken } from '../../src/modules/auth/access-token';
import { hashPassword } from '../../src/modules/auth/password';

let counter = 0;

/** Creates a user directly in the database and returns it with a valid access token. */
export async function createUser(role: Role = 'DEVELOPER', password = 'correct-horse-battery') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      name: `${role.toLowerCase()} ${counter}`,
      email: `${role.toLowerCase()}${counter}@example.com`,
      passwordHash: await hashPassword(password),
      role,
    },
  });

  return { user, password, token: signAccessToken(user) };
}

export function authed(app: Express, token: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}
