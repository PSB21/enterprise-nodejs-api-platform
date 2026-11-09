import { z } from 'zod';

import { paginationSchema } from '../../lib/pagination';
import { API_STATUSES } from './api.model';

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a valid id');

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .min(3)
  .max(60);

const planSchema = z.object({
  name: z.string().trim().min(1).max(50),
  rateLimitPerMinute: z.number().int().min(1).max(10_000),
  monthlyQuota: z.number().int().min(1).optional(),
});

const plansSchema = z
  .array(planSchema)
  .min(1)
  .max(5)
  .refine(
    (plans) => new Set(plans.map((p) => p.name.toLowerCase())).size === plans.length,
    'Plan names must be unique'
  );

const tagsSchema = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10);

// The fields without defaults. Both schemas below build on this.
const apiFields = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  version: z.string().trim().min(1).max(20),
  status: z.enum(API_STATUSES),
  upstreamUrl: z.url({ protocol: /^https?$/ }),
  tags: tagsSchema,
  plans: plansSchema,
});

export const createApiSchema = apiFields.extend({
  slug: slugSchema.optional(),
  version: apiFields.shape.version.default('v1'),
  status: apiFields.shape.status.default('draft'),
  tags: tagsSchema.default([]),
});

// Built without defaults on purpose: a default here would quietly overwrite a field the client
// did not send, for example resetting status to "draft" when only the description changed.
// The slug is left out: it appears in gateway URLs that developers already use.
export const updateApiSchema = apiFields
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change');

export const listApisQuery = paginationSchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
  status: z.enum(API_STATUSES).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type CreateApiInput = z.infer<typeof createApiSchema>;
export type UpdateApiInput = z.infer<typeof updateApiSchema>;
export type ListApisQuery = z.infer<typeof listApisQuery>;
