import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const NINETY_DAYS = 90 * 24 * 60 * 60;

const notificationSchema = new Schema(
  {
    // A user ID from Postgres.
    userId: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    // Set when the notification was created by an event, so a repeated event is ignored.
    eventId: { type: String },
  },
  { timestamps: true }
);

// A user's newest notifications first.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unique only where eventId exists: notifications written directly have none.
notificationSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } }
);
// TTL index: MongoDB deletes notifications 90 days after they were created.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS });

export type NotificationDocument = HydratedDocument<InferSchemaType<typeof notificationSchema>>;

export const NotificationModel = model('Notification', notificationSchema);

export function toNotificationResponse(n: NotificationDocument) {
  return {
    id: n.id as string,
    type: n.type,
    message: n.message,
    data: n.data as Record<string, unknown>,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}
