// Runs before every test file, before any app code is imported.
//
// dotenv never overwrites a variable that is already set, so whatever is set here wins over
// apps/api/.env. That is how the tests are kept away from the real databases.
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

const envFile = path.join(__dirname, '..', '.env');
const local = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

// In CI these come from the environment; on a laptop they come from apps/api/.env.
const testUrl = process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL;
const realUrl = process.env.DATABASE_URL ?? local.DATABASE_URL;
const testMongo = process.env.TEST_MONGODB_URI ?? local.TEST_MONGODB_URI;
const realMongo = process.env.MONGODB_URI ?? local.MONGODB_URI;

if (testUrl && realUrl && new URL(testUrl).host === new URL(realUrl).host) {
  throw new Error('TEST_DATABASE_URL points at the main database. Tests delete data, so stopping.');
}

if (testMongo && realMongo) {
  const sameHost = new URL(testMongo).host === new URL(realMongo).host;
  const sameDb = new URL(testMongo).pathname === new URL(realMongo).pathname;
  if (sameHost && sameDb) {
    throw new Error(
      'TEST_MONGODB_URI points at the main database. Tests delete data, so stopping.'
    );
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl ?? 'postgresql://test:test@localhost:5432/test';
process.env.MONGODB_URI = testMongo ?? 'mongodb://localhost:27017/ams_test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.HAS_TEST_DATABASE = testUrl ? 'true' : 'false';
process.env.HAS_TEST_MONGO = testMongo ? 'true' : 'false';
