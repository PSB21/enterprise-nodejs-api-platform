import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

jest.mock('../src/db/prisma', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

describe('GET /api/v1/health/ready', () => {
  afterEach(() => {
    queryRaw.mockReset();
  });

  it('returns 200 when Postgres responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(createApp()).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', postgres: 'ok' });
  });

  it('returns 503 and hides the cause when Postgres is unreachable', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(new Error('connect failed for postgresql://user:secret@host/db'));

    const res = await request(createApp()).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
