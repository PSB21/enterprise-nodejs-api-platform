import { z } from 'zod';

import { paginationSchema } from '../../lib/pagination';
import { objectIdSchema } from '../apis/api.schemas';

export const createApiKeySchema = z.object({
  accessRequestId: objectIdSchema,
  name: z.string().trim().min(1).max(50).default('Default key'),
});

export const listApiKeysQuery = paginationSchema.extend({
  includeRevoked: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const apiKeyIdParams = z.object({ id: objectIdSchema });

export const revokeAccessSchema = z.object({ note: z.string().trim().min(3).max(500) });
