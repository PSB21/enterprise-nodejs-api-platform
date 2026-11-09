import crypto from 'node:crypto';

import { env } from '../config/env';
import { handleEvent } from './handlers';
import { RabbitPublisher } from './rabbitmq';
import type { DomainEvent, NewEvent } from './types';

/**
 * Where events go.
 *
 * - "rabbitmq": published to RabbitMQ and handled by the separate worker process.
 * - "inline": handled inside this process, right after the response. No broker needed, which
 *   suits local development and tests. Events are lost if the process stops at that moment.
 */
interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  close(): Promise<void>;
}

class InlineBus implements EventBus {
  private pending = new Set<Promise<void>>();

  async publish(event: DomainEvent) {
    const work = handleEvent(event)
      .catch((err: unknown) => console.error(`Failed to handle event ${event.type}:`, err))
      .finally(() => this.pending.delete(work));
    this.pending.add(work);
  }

  /** Waits for events still being handled. Used by tests and on shutdown. */
  async drain() {
    await Promise.all([...this.pending]);
  }

  async close() {
    await this.drain();
  }
}

let bus: EventBus | undefined;

function getBus(): EventBus {
  bus ??= env.EVENT_BUS === 'rabbitmq' ? new RabbitPublisher(env.AMQP_URL!) : new InlineBus();
  return bus;
}

/**
 * Publishes an event. Call it only after the change it describes has been saved.
 *
 * It never throws: the change has already happened, so a broker outage must not turn a
 * successful request into an error. The cost is that the event can be lost in that case.
 * The full fix is a transactional outbox: save the event in the same transaction as the
 * change, and publish it from there.
 */
export async function publishEvent(input: NewEvent) {
  const event: DomainEvent = {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    ...input,
  };

  try {
    await getBus().publish(event);
  } catch (err) {
    console.error(`Failed to publish event ${event.type} ${event.id}:`, err);
  }
}

/** Waits for in-process events to finish (inline mode only). */
export async function drainEvents() {
  if (bus instanceof InlineBus) await bus.drain();
}

export async function closeEventBus() {
  await bus?.close();
  bus = undefined;
}
