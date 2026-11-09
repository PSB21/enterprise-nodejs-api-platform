// Runs once before all tests: brings the test database schema up to date.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

export default function globalSetup() {
  const apiDir = path.join(__dirname, '..');
  const envFile = path.join(apiDir, '.env');
  const local = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const directUrl =
    process.env.TEST_DATABASE_URL_UNPOOLED ??
    local.TEST_DATABASE_URL_UNPOOLED ??
    process.env.TEST_DATABASE_URL;

  if (!directUrl) {
    console.warn('\nNo TEST_DATABASE_URL set: database tests will fail. See the README.\n');
    return;
  }

  execSync('npx prisma migrate deploy', {
    cwd: apiDir,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL_UNPOOLED: directUrl },
  });
}
