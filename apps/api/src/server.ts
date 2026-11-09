import { createApp } from './app';
import { env } from './config/env';
import { connectMongo, disconnectMongo } from './db/mongo';
import { prisma } from './db/prisma';

async function main() {
  // Connect before accepting traffic, so the first requests do not fail.
  await connectMongo();

  const server = createApp().listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  function shutdown(signal: NodeJS.Signals) {
    console.log(`${signal} received, shutting down`);
    // Stop accepting connections, let requests in progress finish, then close the databases.
    server.close(() => {
      void Promise.allSettled([prisma.$disconnect(), disconnectMongo()]).then(() =>
        process.exit(0)
      );
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
