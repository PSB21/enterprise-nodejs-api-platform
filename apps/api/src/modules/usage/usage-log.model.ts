import { Schema, model, type InferSchemaType } from 'mongoose';

const RETENTION_DAYS = 30;

/** One document per request that reached the gateway with a valid key. */
const usageLogSchema = new Schema(
  {
    apiId: { type: Schema.Types.ObjectId, required: true },
    keyId: { type: Schema.Types.ObjectId, required: true },
    developerId: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  // These are written in bulk and never edited, so the version key and timestamps are skipped.
  { versionKey: false }
);

// Analytics always filter by one API, key or developer over a time range.
usageLogSchema.index({ apiId: 1, at: -1 });
usageLogSchema.index({ developerId: 1, at: -1 });
usageLogSchema.index({ keyId: 1, at: -1 });
// TTL index: MongoDB deletes logs older than the retention period in the background.
usageLogSchema.index({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

export type UsageLogFields = InferSchemaType<typeof usageLogSchema>;

export const UsageLogModel = model('UsageLog', usageLogSchema);
