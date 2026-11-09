import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const apiKeySchema = new Schema(
  {
    accessRequestId: { type: Schema.Types.ObjectId, ref: 'AccessRequest', required: true },
    apiId: { type: Schema.Types.ObjectId, ref: 'Api', required: true },
    developerId: { type: String, required: true },
    // Copied from the approved request, so the gateway knows the rate limit without a lookup.
    planName: { type: String, required: true },
    name: { type: String, required: true, maxlength: 50 },
    // The first characters of the key, safe to display so users can tell their keys apart.
    prefix: { type: String, required: true },
    // SHA-256 of the full key. The key itself is never stored.
    keyHash: { type: String, required: true, unique: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

apiKeySchema.index({ developerId: 1, createdAt: -1 });
apiKeySchema.index({ accessRequestId: 1, revokedAt: 1 });

export type ApiKeyFields = InferSchemaType<typeof apiKeySchema>;
export type ApiKeyDocument = HydratedDocument<ApiKeyFields>;

export const ApiKeyModel = model('ApiKey', apiKeySchema);
