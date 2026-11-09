import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'revoked'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

/** Statuses that count as "currently has or wants access". */
export const ACTIVE_STATUSES: readonly AccessRequestStatus[] = ['pending', 'approved'];

// Every status change is appended here, so the full timeline can be shown and audited.
const historyEntrySchema = new Schema(
  {
    status: { type: String, enum: ACCESS_REQUEST_STATUSES, required: true },
    by: { type: String, required: true },
    note: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const accessRequestSchema = new Schema(
  {
    apiId: { type: Schema.Types.ObjectId, ref: 'Api', required: true },
    // Copied from the API so a publisher's review queue is one indexed query, without a join.
    apiOwnerId: { type: String, required: true },
    developerId: { type: String, required: true },
    planName: { type: String, required: true },
    useCase: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ACCESS_REQUEST_STATUSES, default: 'pending' },
    // True while pending or approved. Exists only to power the partial unique index below.
    active: { type: Boolean, default: true },
    reviewNote: { type: String, maxlength: 500 },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

// A developer can have only one pending or approved request per API. A partial index only
// covers documents matching the filter, so rejected and revoked requests can pile up freely.
accessRequestSchema.index(
  { apiId: 1, developerId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_request' }
);
accessRequestSchema.index({ developerId: 1, createdAt: -1 });
accessRequestSchema.index({ apiOwnerId: 1, status: 1, createdAt: -1 });

export type AccessRequestFields = InferSchemaType<typeof accessRequestSchema>;
export type AccessRequestDocument = HydratedDocument<AccessRequestFields>;

export const AccessRequestModel = model('AccessRequest', accessRequestSchema);
