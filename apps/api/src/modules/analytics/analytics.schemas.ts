import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 90;

/**
 * A time range. Defaults to the last 7 days. Hourly buckets are only allowed for ranges up to
 * 7 days, so a chart never has more than 168 points.
 */
export const rangeQuery = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    interval: z.enum(['hour', 'day']).optional(),
  })
  .transform(({ from, to, interval }, ctx) => {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 7 * DAY_MS);
    const days = (end.getTime() - start.getTime()) / DAY_MS;

    if (days <= 0) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: '`from` must be before `to`' });
      return z.NEVER;
    }
    if (days > MAX_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: `At most ${MAX_RANGE_DAYS} days` });
      return z.NEVER;
    }
    const unit = interval ?? (days <= 2 ? 'hour' : 'day');
    if (unit === 'hour' && days > 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['interval'],
        message: 'Hourly data is limited to 7 days',
      });
      return z.NEVER;
    }

    return { from: start, to: end, interval: unit };
  });

export type Range = z.infer<typeof rangeQuery>;

// Documented separately: the transform above has no JSON Schema equivalent.
export const rangeQueryDoc = z.object({
  from: z.iso.datetime().optional().describe('Start, ISO 8601. Default: 7 days before `to`'),
  to: z.iso.datetime().optional().describe('End, ISO 8601. Default: now'),
  interval: z
    .enum(['hour', 'day'])
    .optional()
    .describe('Bucket size. Default: hour for 2 days or less, otherwise day'),
});
