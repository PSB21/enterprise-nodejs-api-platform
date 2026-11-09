import request from 'supertest';

import { createApp } from '../src/app';
import { pingMongo } from '../src/db/mongo';
import { prisma } from '../src/db/prisma';

jest.mock('../src/db/prisma', () => ({
  prisma: { $queryRaw: jest.fn() },
}));
jest.mock('../src/db/mongo', () => ({
  pingMongo: jest.fn(),
}));

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const ping = pingMongo as jest.Mock;

describe('GET /api/v1/health/ready', () => {
  afterEach(() => {
    queryRaw.mockReset();
    ping.mockReset();
  });

  it('returns 200 when both databases respond', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue(undefined);

    const res = await request(createApp()).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', postgres: 'ok', mongodb: 'ok' });
  });

  it('returns 503, says which database failed, and hides the cause', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(new Error('connect failed for postgresql://user:secret@host/db'));
    ping.mockResolvedValue(undefined);

    const res = await request(createApp()).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(res.body.error.details).toEqual({ postgres: 'unavailable', mongodb: 'ok' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
