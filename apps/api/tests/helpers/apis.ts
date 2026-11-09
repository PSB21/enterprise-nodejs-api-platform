import { ApiModel } from '../../src/modules/apis/api.model';

let counter = 0;

export function apiInput(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    name: `Weather API ${counter}`,
    description: 'Current conditions and forecasts for any city.',
    upstreamUrl: 'http://localhost:5000/mock/orders',
    tags: ['weather'],
    plans: [
      { name: 'Free', rateLimitPerMinute: 10, monthlyQuota: 1000 },
      { name: 'Pro', rateLimitPerMinute: 100 },
    ],
    ...overrides,
  };
}

/** Creates an API directly in the database. */
export function createApi(ownerId: string, overrides: Record<string, unknown> = {}) {
  const input = apiInput(overrides);
  return ApiModel.create({
    status: 'published',
    slug: input.name.toLowerCase().replace(/\s+/g, '-'),
    ...input,
    ownerId,
  });
}
