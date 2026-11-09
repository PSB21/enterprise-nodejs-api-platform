import mongoose from 'mongoose';

import { env } from '../config/env';

// Treat any `$` operator inside a query filter value as plain data. Even if user input slips
// into a filter, `{ email: { $ne: null } }` then matches nothing instead of every document.
mongoose.set('sanitizeFilter', true);
// Silently drop filter fields that are not in the schema, rather than querying on them.
mongoose.set('strictQuery', true);

export async function connectMongo(uri: string = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

export async function pingMongo() {
  const db = mongoose.connection.db;

  if (mongoose.connection.readyState !== 1 || !db) {
    throw new Error('MongoDB is not connected');
  }

  await db.admin().ping();
}
