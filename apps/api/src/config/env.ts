import dotenv from 'dotenv';
import { z } from 'zod';

const commaList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );

// An empty value (`REDIS_URL=` copied from .env.example) means "not set", not "invalid URL".
const optionalUrl = (protocol: RegExp) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.url({ protocol }).optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    // Browser origins allowed to call the API.
    CORS_ORIGINS: commaList('http://localhost:3000'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    MONGODB_URI: z.url({ protocol: /^mongodb(\+srv)?$/ }),
    // Signs access tokens. Anyone who knows it can forge a login, so it must be long and random.
    JWT_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    // Hosts the gateway may forward requests to. Without this list, anyone allowed to publish an
    // API could make the server call internal addresses (server-side request forgery).
    UPSTREAM_ALLOWED_HOSTS: commaList('localhost,127.0.0.1'),
    // How long the gateway waits for an upstream API before returning 504.
    GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
    // Number of proxies in front of the app (1 on most hosting platforms, 0 locally).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Optional. Without it, rate limits and caches are kept in memory.
    REDIS_URL: optionalUrl(/^rediss?$/),
    CACHE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    // "inline" handles events inside the API; "rabbitmq" sends them to the worker process.
    EVENT_BUS: z.enum(['inline', 'rabbitmq']).default('inline'),
    AMQP_URL: optionalUrl(/^amqps?$/),
    // Also run the event worker inside the API process, for hosts with a single free service.
    RUN_WORKER_IN_API: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((e) => e.EVENT_BUS !== 'rabbitmq' || Boolean(e.AMQP_URL), {
    path: ['AMQP_URL'],
    message: 'AMQP_URL is required when EVENT_BUS=rabbitmq',
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates configuration so a bad deployment fails at startup, not on the first request.
 * The error lists variable names only, because values may be secrets.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${names}`);
  }

  return result.data;
}

dotenv.config({ quiet: true });

export const env = parseEnv(process.env);
