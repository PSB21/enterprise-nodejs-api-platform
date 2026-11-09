import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const API_STATUSES = ['draft', 'published', 'deprecated'] as const;

/**
 * Plans are embedded in the API document rather than stored in their own collection: they are
 * small, always read together with their API, and never queried on their own.
 */
const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    rateLimitPerMinute: { type: Number, required: true, min: 1 },
    monthlyQuota: { type: Number, min: 1 },
  },
  { _id: false }
);

const apiSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, maxlength: 2000 },
    version: { type: String, default: 'v1', maxlength: 20 },
    status: { type: String, enum: API_STATUSES, default: 'draft' },
    // The publisher's user ID from Postgres. There is no foreign key across the two databases,
    // so the application is responsible for keeping this valid.
    ownerId: { type: String, required: true },
    // Where the gateway forwards requests. Visible only to the owner and admins.
    upstreamUrl: { type: String, required: true },
    tags: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
    plans: {
      type: [planSchema],
      validate: {
        validator: (plans: unknown[]) => plans.length > 0,
        message: 'An API needs at least one plan',
      },
    },
  },
  { timestamps: true }
);

// Search uses partial (regex) matching instead of a text index, because a text index only
// matches whole words: "logi" would not find "logistics". See listApis in api.service.ts.
// Serves the default catalog listing: filter by status, newest first.
apiSchema.index({ status: 1, createdAt: -1 });
apiSchema.index({ ownerId: 1, createdAt: -1 });

export type ApiFields = InferSchemaType<typeof apiSchema>;
export type ApiDocument = HydratedDocument<ApiFields>;

export const ApiModel = model('Api', apiSchema);
