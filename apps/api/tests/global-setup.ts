// Runs once before all tests: prepares the test databases.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

declare global {
  var __MONGO_MEMORY__: { stop: () => Promise<unknown> } | undefined;
}

export default async function globalSetup() {
  const apiDir = path.join(__dirname, '..');
  const envFile = path.join(apiDir, '.env');
  const local = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

  // Postgres: bring the test branch's schema up to date.
  const directUrl =
    process.env.TEST_DATABASE_URL_UNPOOLED ??
    local.TEST_DATABASE_URL_UNPOOLED ??
    process.env.TEST_DATABASE_URL;

  if (directUrl) {
    execSync('npx prisma migrate deploy', {
      cwd: apiDir,
      stdio: 'ignore',
      env: { ...process.env, DATABASE_URL_UNPOOLED: directUrl },
    });
  } else {
    console.warn('\nNo TEST_DATABASE_URL set: Postgres tests will fail. See the README.\n');
  }

  // MongoDB: use TEST_MONGODB_URI if given (a laptop uses a separate Atlas database).
  // Otherwise, as in CI, start a throwaway in-memory replica set; transactions need a replica set.
  if (!process.env.TEST_MONGODB_URI && !local.TEST_MONGODB_URI) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server-core');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.TEST_MONGODB_URI = replSet.getUri('ams_test');
    globalThis.__MONGO_MEMORY__ = replSet;
  }
}
