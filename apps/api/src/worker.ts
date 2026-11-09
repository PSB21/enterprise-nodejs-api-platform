/**
 * The event worker: consumes events from RabbitMQ, writes the audit log and sends
 * notifications. Runs as its own process, so slow event handling never delays API requests,
 * and it can be scaled separately.
 *
 *   npm run worker --workspace=@ams/api
 */
import { env } from './config/env';
import { connectMongo, disconnectMongo } from './db/mongo';
import { prisma } from './db/prisma';
import { handleEvent } from './events/handlers';
import { startConsumer } from './events/rabbitmq';

async function main() {
  if (env.EVENT_BUS !== 'rabbitmq' || !env.AMQP_URL) {
    throw new Error('The worker needs EVENT_BUS=rabbitmq and AMQP_URL.');
  }

  await connectMongo();
  const stop = await startConsumer(env.AMQP_URL, handleEvent);
  console.log('Event worker started');

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`${signal} received, stopping the worker`);
    // Stop taking messages first; unacknowledged ones go back to the queue for next time.
    await stop();
    await Promise.allSettled([prisma.$disconnect(), disconnectMongo()]);
    process.exit(0);
  };

  process.on('SIGTERM', (s) => void shutdown(s));
  process.on('SIGINT', (s) => void shutdown(s));
}

main().catch((err: unknown) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
