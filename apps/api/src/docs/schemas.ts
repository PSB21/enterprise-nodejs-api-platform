import { z } from 'zod';

import { Role } from '../generated/prisma/enums';
import { API_STATUSES } from '../modules/apis/api.model';

// Response shapes, used only for documentation. Requests are documented from the real
// validation schemas in each module.

export const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(Role),
  createdAt: z.iso.datetime(),
});

export const sessionSchema = z.object({
  accessToken: z.string().describe('JWT, valid for 15 minutes'),
  user: publicUserSchema,
});

export const planResponseSchema = z.object({
  name: z.string(),
  rateLimitPerMinute: z.number().int(),
  monthlyQuota: z.number().int().nullable(),
});

export const apiResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  status: z.enum(API_STATUSES),
  ownerId: z.uuid(),
  tags: z.array(z.string()),
  plans: z.array(planResponseSchema),
  upstreamUrl: z.url().optional().describe('Only shown to the owner and admins'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const pageMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().describe('Stable, machine-readable code such as VALIDATION_ERROR'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
