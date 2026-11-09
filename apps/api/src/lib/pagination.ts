import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a single request cannot ask for the whole table.
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkip({ page, limit }: Pagination) {
  return (page - 1) * limit;
}

export function pageMeta({ page, limit }: Pagination, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
