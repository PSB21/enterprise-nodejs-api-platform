import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  // Stop accepting new connections and let requests in progress finish, then close the database.
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
