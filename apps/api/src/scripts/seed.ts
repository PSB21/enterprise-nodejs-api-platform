/**
 * Fills the databases with demo data: one user per role, three APIs, an approved access
 * request with a working API key, a pending request, and a week of synthetic gateway traffic.
 *
 * Safe to run more than once: existing records are reused, not duplicated.
 *
 *   npm run db:seed --workspace=@ams/api
 */
import { env } from '../config/env';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { prisma } from '../db/prisma';
import type { Role } from '../generated/prisma/enums';
import { AccessRequestModel } from '../modules/access-requests/access-request.model';
import { ApiModel } from '../modules/apis/api.model';
import { ApiKeyModel } from '../modules/api-keys/api-key.model';
import { generateApiKey } from '../modules/api-keys/api-key.service';
import { hashPassword } from '../modules/auth/password';
import { UsageLogModel } from '../modules/usage/usage-log.model';

const PASSWORD = process.env.SEED_PASSWORD ?? 'DemoPass123!';
// Where the sample upstream runs. On a host, set this to the API's public URL.
const UPSTREAM_BASE = process.env.SEED_UPSTREAM_BASE ?? `http://localhost:${env.PORT}`;

async function upsertUser(name: string, email: string, role: Role) {
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: { role },
    create: { name, email, passwordHash, role },
  });
}

async function upsertApi(ownerId: string, data: Record<string, unknown> & { slug: string }) {
  return ApiModel.findOneAndUpdate(
    { slug: data.slug },
    { $setOnInsert: { ...data, ownerId } },
    { upsert: true, returnDocument: 'after' }
  );
}

/** A week of fake traffic: busier in daytime hours, with some slow calls and errors. */
function syntheticUsage(apiId: unknown, keyId: unknown, developerId: string, slug: string) {
  const logs = [];
  const now = Date.now();
  for (let hoursAgo = 7 * 24; hoursAgo > 0; hoursAgo -= 1) {
    const at = new Date(now - hoursAgo * 3_600_000);
    const daytime = at.getUTCHours() >= 3 && at.getUTCHours() <= 15;
    const calls = Math.floor(Math.random() * (daytime ? 25 : 6));
    for (let i = 0; i < calls; i += 1) {
      const roll = Math.random();
      const statusCode = roll < 0.03 ? 500 : roll < 0.08 ? 404 : roll < 0.1 ? 429 : 200;
      logs.push({
        apiId,
        keyId,
        developerId,
        method: Math.random() < 0.8 ? 'GET' : 'POST',
        path: `/${slug}/orders`,
        statusCode,
        latencyMs: Math.round(40 + Math.random() * 120 + (Math.random() < 0.05 ? 600 : 0)),
        at: new Date(at.getTime() + Math.random() * 3_600_000),
      });
    }
  }
  return logs;
}

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Refusing to seed a production database. Set SEED_ALLOW_PRODUCTION=true.');
  }

  await connectMongo();

  const admin = await upsertUser('Ada Admin', 'admin@ams.dev', 'ADMIN');
  const publisher = await upsertUser('Priya Publisher', 'publisher@ams.dev', 'PUBLISHER');
  const developer = await upsertUser('Dev Patel', 'developer@ams.dev', 'DEVELOPER');

  const orders = await upsertApi(publisher.id, {
    name: 'Orders API',
    slug: 'orders',
    description: 'Create and track customer orders. Backed by the built-in sample upstream.',
    status: 'published',
    upstreamUrl: `${UPSTREAM_BASE}/mock/orders`,
    tags: ['commerce', 'orders'],
    plans: [
      { name: 'Free', rateLimitPerMinute: 30, monthlyQuota: 10_000 },
      { name: 'Pro', rateLimitPerMinute: 300 },
    ],
  });
  const shipping = await upsertApi(publisher.id, {
    name: 'Shipping Tracker',
    slug: 'shipping-tracker',
    description: 'Live parcel tracking across couriers, with delivery estimates.',
    status: 'published',
    upstreamUrl: `${UPSTREAM_BASE}/mock/orders`,
    tags: ['logistics'],
    plans: [{ name: 'Free', rateLimitPerMinute: 20 }],
  });
  await upsertApi(publisher.id, {
    name: 'Payments Sandbox',
    slug: 'payments-sandbox',
    description: 'Test card payments without moving real money. Still being built.',
    status: 'draft',
    upstreamUrl: `${UPSTREAM_BASE}/mock/orders`,
    tags: ['payments'],
    plans: [{ name: 'Free', rateLimitPerMinute: 10 }],
  });

  // An approved request with a key, and a pending one for the publisher's review queue.
  const now = new Date();
  let approved = await AccessRequestModel.findOne({
    apiId: orders._id,
    developerId: developer.id,
    active: true,
  });
  approved ??= await AccessRequestModel.create({
    apiId: orders._id,
    apiOwnerId: publisher.id,
    developerId: developer.id,
    planName: 'Free',
    useCase: 'Show order status in our customer support dashboard.',
    status: 'approved',
    reviewedBy: publisher.id,
    reviewedAt: now,
    reviewNote: 'Approved for the support dashboard.',
    history: [
      { status: 'pending', by: developer.id, at: now },
      {
        status: 'approved',
        by: publisher.id,
        note: 'Approved for the support dashboard.',
        at: now,
      },
    ],
  });

  const pendingExists = await AccessRequestModel.exists({
    apiId: shipping._id,
    developerId: developer.id,
    active: true,
  });
  if (!pendingExists) {
    await AccessRequestModel.create({
      apiId: shipping._id,
      apiOwnerId: publisher.id,
      developerId: developer.id,
      planName: 'Free',
      useCase: 'Notify customers when their parcel is out for delivery.',
      history: [{ status: 'pending', by: developer.id, at: now }],
    });
  }

  let key = await ApiKeyModel.findOne({ accessRequestId: approved._id, revokedAt: null });
  let rawKey: string | undefined;
  if (!key) {
    const generated = generateApiKey();
    rawKey = generated.key;
    key = await ApiKeyModel.create({
      accessRequestId: approved._id,
      apiId: orders._id,
      developerId: developer.id,
      planName: 'Free',
      name: 'Seeded demo key',
      prefix: generated.prefix,
      keyHash: generated.keyHash,
    });
  }

  let usage = 0;
  if (process.env.SEED_USAGE !== 'false' && !(await UsageLogModel.exists({ apiId: orders._id }))) {
    const logs = syntheticUsage(orders._id, key._id, developer.id, orders.slug);
    await UsageLogModel.insertMany(logs);
    usage = logs.length;
  }

  console.log('\nSeed complete.\n');
  console.log(`Users (password: ${PASSWORD})`);
  for (const u of [admin, publisher, developer]) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
  console.log(`\nAPIs: orders, shipping-tracker (published), payments-sandbox (draft)`);
  if (rawKey) {
    console.log(`\nDemo API key (shown once, only its hash is stored):\n  ${rawKey}`);
    console.log(`\nTry it:\n  curl -H "x-api-key: ${rawKey}" ${UPSTREAM_BASE}/gateway/orders`);
  } else {
    console.log('\nA demo API key already exists. Revoke it and run again for a new one.');
  }
  if (usage)
    console.log(`\nInserted ${usage} synthetic usage logs (demo traffic, not real calls).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => Promise.allSettled([prisma.$disconnect(), disconnectMongo()]));
