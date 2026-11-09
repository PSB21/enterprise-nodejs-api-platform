import { z } from 'zod';

import { paginationSchema } from '../../lib/pagination';
import { objectIdSchema } from '../apis/api.schemas';
import { ACCESS_REQUEST_STATUSES } from './access-request.model';

export const createAccessRequestSchema = z.object({
  // The API's id or slug.
  api: z.string().trim().min(1).max(60),
  planName: z.string().trim().min(1).max(50),
  useCase: z
    .string()
    .trim()
    .min(10, 'Describe how you will use the API in at least 10 characters')
    .max(1000),
});

export const listAccessRequestsQuery = paginationSchema.extend({
  status: z.enum(ACCESS_REQUEST_STATUSES).optional(),
  apiId: objectIdSchema.optional(),
});

export const accessRequestIdParams = z.object({ id: objectIdSchema });

export const approveSchema = z.object({ note: z.string().trim().max(500).optional() });

// A reason is required when saying no, so the developer knows what to change.
export const rejectSchema = z.object({ note: z.string().trim().min(3).max(500) });

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ListAccessRequestsQuery = z.infer<typeof listAccessRequestsQuery>;
