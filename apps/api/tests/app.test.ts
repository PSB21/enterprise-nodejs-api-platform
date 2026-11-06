import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app';
import { AppError } from '../src/errors/app-error';
import { errorHandler } from '../src/middleware/error-handler';

describe('GET /api/v1/health', () => {
  it('reports that the API is up', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows a configured origin', async () => {
    const res = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not allow any other origin', async () => {
    const res = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('returns 404 in the standard format for an unknown route', async () => {
    const res = await request(createApp()).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found: GET /api/v1/nope' },
    });
  });

  it('returns 400 for malformed JSON instead of a 500', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 413 when the body is over the size limit', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .send({ data: 'x'.repeat(101 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it('sends the status, code and details of an AppError', async () => {
    const app = express();
    app.get('/', () => {
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid input', [{ field: 'email' }]);
    });
    app.use(errorHandler);

    const res = await request(app).get('/');

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: [{ field: 'email' }],
    });
  });

  it('forwards a rejected async handler and hides its message', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/', async () => {
      throw new Error('password=secret');
    });
    app.use(errorHandler);

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
