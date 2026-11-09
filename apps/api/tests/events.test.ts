import crypto from 'node:crypto';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { drainEvents } from '../src/events/bus';
import { handleEvent } from '../src/events/handlers';
import { RabbitPublisher, startConsumer } from '../src/events/rabbitmq';
import type { DomainEvent } from '../src/events/types';
import { resetCache } from '../src/lib/cache';
import { resetRateLimiter } from '../src/lib/rate-limiter';
import { NotificationModel } from '../src/modules/notifications/notification.model';
import { issueKey } from './helpers/access';
import { createApi } from './helpers/apis';
import { requireTestDatabase, resetPostgres } from './helpers/db';
import { resetMongo, setupMongo, teardownMongo } from './helpers/mongo';
import { authed, createUser } from './helpers/users';

// Tests run with EVENT_BUS=inline: the same handler the worker uses runs inside the process.
const app = createApp();

beforeAll(async () => {
  requireTestDatabase();
  await setupMongo();
});
beforeEach(async () => {
  await drainEvents();
  await Promise.all([resetPostgres(), resetMongo()]);
  resetCache();
  resetRateLimiter();
});
afterAll(async () => {
  await drainEvents();
  await Promise.all([prisma.$disconnect(), teardownMongo()]);
});

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: 'access-request.created',
    occurredAt: new Date().toISOString(),
    actorId: null,
    subject: { type: 'access-request', id: 'req-1' },
    data: {
      apiOwnerId: crypto.randomUUID(),
      apiName: 'Orders API',
      planName: 'Free',
      developerName: 'Asha',
    },
    ...overrides,
  };
}

describe('handleEvent', () => {
  it('writes an audit entry and the notification the event calls for', async () => {
    const e = event();

    await handleEvent(e);

    const audit = await prisma.auditLog.findUniqueOrThrow({ where: { eventId: e.id } });
    expect(audit).toMatchObject({ type: 'access-request.created', subjectId: 'req-1' });
    const notification = await NotificationModel.findOne({ eventId: e.id });
    expect(notification!.message).toBe('Asha requested Free access to Orders API.');
  });

  it('is idempotent: the same event delivered twice is recorded once', async () => {
    const e = event();

    await handleEvent(e);
    await handleEvent(e);

    expect(await prisma.auditLog.count({ where: { eventId: e.id } })).toBe(1);
    expect(await NotificationModel.countDocuments({ eventId: e.id })).toBe(1);
  });
});

describe('events from real actions', () => {
  it('notifies the publisher of a new request and audits the decision', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const api = await createApi(publisher.user.id);

    const created = await authed(app, dev.token)
      .post('/api/v1/access-requests')
      .send({ api: api.slug, planName: 'Free', useCase: 'Order tracking for our support team.' });
    await authed(app, publisher.token)
      .post(`/api/v1/access-requests/${created.body.data.id}/approve`)
      .send({});
    await drainEvents();

    const inbox = await authed(app, publisher.token).get('/api/v1/notifications');
    expect(inbox.body.data[0].message).toBe(
      `${dev.user.name} requested Free access to ${api.name}.`
    );
    const types = (await prisma.auditLog.findMany({ orderBy: { occurredAt: 'asc' } })).map(
      (a) => a.type
    );
    expect(types).toEqual(['access-request.created', 'access-request.approved']);
  });

  it('audits key creation without ever storing the key', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const api = await createApi(publisher.user.id);
    const { request } = await issueKey(api, dev.user.id);

    const res = await authed(app, dev.token)
      .post('/api/v1/api-keys')
      .send({ accessRequestId: request.id, name: 'CI' });
    await drainEvents();

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { type: 'api-key.created' } });
    expect(audit.actorId).toBe(dev.user.id);
    expect(JSON.stringify(audit)).not.toContain(res.body.data.key);
  });

  it('warns the developer once when 80% of the monthly quota is used', async () => {
    const publisher = await createUser('PUBLISHER');
    const dev = await createUser('DEVELOPER');
    const api = await createApi(publisher.user.id, {
      upstreamUrl: 'http://127.0.0.1:1/unreachable',
      plans: [{ name: 'Free', rateLimitPerMinute: 100, monthlyQuota: 5 }],
    });
    const { key } = await issueKey(api, dev.user.id);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // The upstream is unreachable, but each call still counts against the quota.
    for (let i = 0; i < 5; i += 1) {
      await authed(app, '').get(`/gateway/${api.slug}/x`).set('x-api-key', key);
    }
    await drainEvents();
    logged.mockRestore();

    const warnings = await NotificationModel.find({ type: 'usage.quota-warning' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.userId).toBe(dev.user.id);
    expect(warnings[0]!.message).toContain('4 of your 5');
  });
});

describe('GET /api/v1/audit-logs', () => {
  it('is admin only, newest first, and filters by type', async () => {
    const admin = await createUser('ADMIN');
    const dev = await createUser('DEVELOPER');
    await handleEvent(event({ type: 'access-request.created' }));
    await handleEvent(event({ type: 'user.role-changed', subject: { type: 'user', id: 'u' } }));

    const all = await authed(app, admin.token).get('/api/v1/audit-logs');
    const filtered = await authed(app, admin.token).get(
      '/api/v1/audit-logs?type=user.role-changed'
    );

    expect(all.body.meta.total).toBe(2);
    expect(filtered.body.data.map((a: { type: string }) => a.type)).toEqual(['user.role-changed']);
    expect((await authed(app, dev.token).get('/api/v1/audit-logs')).status).toBe(403);
  });
});

// Only in CI, against a real RabbitMQ server.
const withRabbit = process.env.TEST_AMQP_URL ? describe : describe.skip;

withRabbit('RabbitMQ', () => {
  it('delivers a published event to the consumer, which records it', async () => {
    const publisher = new RabbitPublisher(process.env.TEST_AMQP_URL!);
    const received: string[] = [];
    const stop = await startConsumer(process.env.TEST_AMQP_URL!, async (e: DomainEvent) => {
      await handleEvent(e);
      received.push(e.id);
    });
    const e = event();

    await publisher.publish(e);
    for (let i = 0; i < 50 && !received.includes(e.id); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(received).toContain(e.id);
    expect(await prisma.auditLog.count({ where: { eventId: e.id } })).toBe(1);
    await stop();
    await publisher.close();
  });
});
