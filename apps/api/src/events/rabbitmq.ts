import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib';

import type { DomainEvent } from './types';

export const EXCHANGE = 'ams.events';
export const QUEUE = 'ams.events.worker';
export const DEAD_LETTER_EXCHANGE = 'ams.events.dead';
export const DEAD_LETTER_QUEUE = 'ams.events.worker.dead';

/**
 * Declares the exchanges and queues. Safe to call from every process at startup: declaring
 * something that already exists with the same settings does nothing.
 *
 *   publisher ──► ams.events (topic) ──► ams.events.worker ──► worker
 *                                              │ rejected twice
 *                                              ▼
 *                     ams.events.dead (fanout) ──► ams.events.worker.dead
 */
export async function assertTopology(channel: Channel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });

  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '');

  await channel.assertQueue(QUEUE, {
    durable: true,
    // Messages rejected without requeueing go here, instead of being lost.
    deadLetterExchange: DEAD_LETTER_EXCHANGE,
  });
  // '#' matches every routing key, so this queue receives every event type.
  await channel.bindQueue(QUEUE, EXCHANGE, '#');
}

/** Publishes events to RabbitMQ and waits until the broker confirms it has stored each one. */
export class RabbitPublisher {
  private connecting: Promise<{ connection: ChannelModel; channel: ConfirmChannel }> | null = null;

  constructor(private readonly url: string) {}

  private connect() {
    this.connecting ??= (async () => {
      const connection = await amqp.connect(this.url);
      const channel = await connection.createConfirmChannel();
      await assertTopology(channel);
      // If the connection drops, connect again on the next publish.
      connection.on('close', () => {
        this.connecting = null;
      });
      connection.on('error', (err: Error) =>
        console.error('RabbitMQ connection error:', err.message)
      );
      return { connection, channel };
    })().catch((err: unknown) => {
      this.connecting = null;
      throw err;
    });
    return this.connecting;
  }

  async publish(event: DomainEvent) {
    const { channel } = await this.connect();

    await new Promise<void>((resolve, reject) => {
      channel.publish(
        EXCHANGE,
        // The routing key is the event type, so consumers can subscribe to a subset.
        event.type,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true, // written to disk, so it survives a broker restart
          contentType: 'application/json',
          messageId: event.id,
          timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
        },
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async close() {
    if (!this.connecting) return;
    const { connection } = await this.connecting.catch(() => ({ connection: null }));
    this.connecting = null;
    await connection?.close().catch(() => undefined);
  }
}

/**
 * Consumes events and passes each to `handle`. A message is acknowledged only after it was
 * handled, so a crash mid-way means it is delivered again, not lost.
 *
 * On failure it is retried once. If it fails again it goes to the dead-letter queue, where
 * it can be inspected and replayed, instead of blocking the queue forever.
 */
export async function startConsumer(url: string, handle: (event: DomainEvent) => Promise<void>) {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  // At most 10 unacknowledged messages at a time for this worker.
  await channel.prefetch(10);

  const { consumerTag } = await channel.consume(QUEUE, (message) => {
    if (!message) return;

    let event: DomainEvent;
    try {
      event = JSON.parse(message.content.toString()) as DomainEvent;
    } catch {
      // Unreadable: retrying will never help, so dead-letter it straight away.
      channel.nack(message, false, false);
      return;
    }

    handle(event)
      .then(() => channel.ack(message))
      .catch((err: unknown) => {
        console.error(`Failed to handle event ${event.type} ${event.id}:`, err);
        // Requeue on the first failure only; message.fields.redelivered is true on the retry.
        channel.nack(message, false, !message.fields.redelivered);
      });
  });

  return async () => {
    await channel.cancel(consumerTag).catch(() => undefined);
    await connection.close().catch(() => undefined);
  };
}
