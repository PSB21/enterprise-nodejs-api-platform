import mongoose from 'mongoose';

import { connectMongo, disconnectMongo } from '../../src/db/mongo';

/** Connects to the test MongoDB database and builds every model's indexes once per test file. */
export async function setupMongo() {
  if (process.env.HAS_TEST_MONGO !== 'true') {
    throw new Error('This test needs a test MongoDB. See the README.');
  }

  await connectMongo(process.env.MONGODB_URI);
  // Unique and partial indexes are part of the behaviour under test, so they must exist.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

/** Empties every collection, so each test starts from a known state. */
export async function resetMongo() {
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
}

export async function teardownMongo() {
  await disconnectMongo();
}
