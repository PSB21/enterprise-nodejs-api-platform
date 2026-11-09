import { createApp } from './app';
import { env } from './config/env';
import { connectMongo, disconnectMongo } from './db/mongo';
import { prisma } from './db/prisma';
import { closeEventBus } from './events/bus';
import { handleEvent } from './events/handlers';
import { startConsumer } from './events/rabbitmq';
import { disconnectRedis } from './lib/redis';
import { usageRecorder } from './modules/usage/usage-recorder';

async function main() {
  // Connect before accepting traffic, so the first requests do not fail.
  await connectMongo();

  // On hosts that offer only one free service, the worker can run inside the API process.
  // Normally it runs separately (npm run worker), so it can be scaled and restarted alone.
  const stopWorker =
    env.RUN_WORKER_IN_API && env.EVENT_BUS === 'rabbitmq' && env.AMQP_URL
      ? await startConsumer(env.AMQP_URL, handleEvent)
      : undefined;

  const server = createApp().listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT} (${env.NODE_ENV}, events: ${env.EVENT_BUS})`);
  });

  function shutdown(signal: NodeJS.Signals) {
    console.log(`${signal} received, shutting down`);
    // Stop accepting connections and let requests in progress finish. Then write buffered usage
    // logs, finish or hand back pending events, and close every connection.
    server.close(() => {
      void (async () => {
        await stopWorker?.();
        await usageRecorder.stop();
        await closeEventBus();
        await Promise.allSettled([prisma.$disconnect(), disconnectMongo(), disconnectRedis()]);
        process.exit(0);
      })();
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
