import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { createUser } from './helpers/users';

const app = createApp();
const SECRET = 'test-secret-that-is-at-least-32-characters-long';

beforeAll(requireTestDatabase);
beforeEach(resetPostgres);
afterAll(() => prisma.$disconnect());

describe('POST /api/v1/auth/register', () => {
  const valid = { name: 'Asha', email: '  Asha@Example.COM ', password: 'long-enough-1' };

  it('creates a developer, stores a hash and never returns it', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(valid);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Asha',
      email: 'asha@example.com',
      role: 'DEVELOPER',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    expect(stored.passwordHash).not.toBe(valid.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('ignores a role in the request body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...valid, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DEVELOPER');
  });

  it('rejects a duplicate email, whatever its case', async () => {
    await request(app).post('/api/v1/auth/register').send(valid).expect(201);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...valid, email: 'ASHA@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('allows only one account when two sign-ups race', async () => {
    const results = await Promise.all([
      request(app).post('/api/v1/auth/register').send(valid),
      request(app).post('/api/v1/auth/register').send(valid),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ['a missing name', { email: 'a@b.co', password: 'long-enough-1' }, 'name'],
    ['an invalid email', { name: 'A', email: 'nope', password: 'long-enough-1' }, 'email'],
    ['a short password', { name: 'A', email: 'a@b.co', password: 'short' }, 'password'],
    [
      'a password over 72 bytes',
      { name: 'A', email: 'a@b.co', password: 'é'.repeat(37) },
      'password',
    ],
  ])('returns 400 for %s', async (_label, body, field) => {
    const res = await request(app).post('/api/v1/auth/register').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns an access token for the right password', async () => {
    const { user, password } = await createUser('PUBLISHER');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email.toUpperCase(), password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);

    const claims = jwt.verify(res.body.data.accessToken, SECRET) as jwt.JwtPayload;
    expect(claims.sub).toBe(user.id);
    expect(claims.role).toBe('PUBLISHER');
    expect(claims.exp! - claims.iat!).toBe(15 * 60);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { user } = await createUser();

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the logged-in user', async () => {
    const { user, token } = await createUser();

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });
  });

  it('requires a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('tells the client when a token has expired, so it can refresh', async () => {
    const { user } = await createUser();
    const expired = jwt.sign({ role: user.role }, SECRET, { subject: user.id, expiresIn: -10 });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it.each([
    ['a different secret', () => jwt.sign({ role: 'ADMIN' }, 'x'.repeat(40), { subject: 'id' })],
    [
      'the "none" algorithm',
      () => jwt.sign({ role: 'ADMIN' }, '', { algorithm: 'none', subject: 'id' }),
    ],
    ['an unknown role', () => jwt.sign({ role: 'OWNER' }, SECRET, { subject: 'id' })],
  ])('rejects a token signed with %s', async (_label, makeToken) => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});
