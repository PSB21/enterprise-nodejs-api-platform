import { mongo } from 'mongoose';

import { prisma } from '../db/prisma';
import { Prisma } from '../generated/prisma/client';
import { NotificationModel } from '../modules/notifications/notification.model';
import type { DomainEvent } from './types';

const isPrismaDuplicate = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const isMongoDuplicate = (err: unknown) =>
  err instanceof mongo.MongoServerError && err.code === 11000;

/** The notification an event should send, if any. */
function notificationFor(event: DomainEvent) {
  const d = event.data;

  if (event.type === 'access-request.created') {
    return {
      userId: String(d.apiOwnerId),
      message: `${String(d.developerName)} requested ${String(d.planName)} access to ${String(d.apiName)}.`,
    };
  }
  if (event.type === 'usage.quota-warning') {
    return {
      userId: event.subject.id,
      message: `You have used ${String(d.used)} of your ${String(d.quota)} monthly requests for ${String(d.apiSlug)}.`,
    };
  }
  return null;
}

/**
 * Handles one event: records it in the audit log and sends any notification.
 *
 * Safe to run more than once for the same event. Both writes are keyed by the event id with
 * a unique index, so a repeat delivery hits a duplicate-key error, which is ignored. That is
 * what makes "at least once" delivery from RabbitMQ behave like "exactly once" here.
 */
export async function handleEvent(event: DomainEvent) {
  try {
    await prisma.auditLog.create({
      data: {
        eventId: event.id,
        type: event.type,
        actorId: event.actorId,
        subjectType: event.subject.type,
        subjectId: event.subject.id,
        data: event.data as Prisma.InputJsonValue,
        occurredAt: new Date(event.occurredAt),
      },
    });
  } catch (err) {
    if (!isPrismaDuplicate(err)) throw err;
  }

  const notification = notificationFor(event);
  if (notification) {
    try {
      await NotificationModel.create({
        ...notification,
        type: event.type,
        eventId: event.id,
        data: event.data,
      });
    } catch (err) {
      if (!isMongoDuplicate(err)) throw err;
    }
  }
}
