import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

function createPrismaClient() {
  const url = new URL(env.DATABASE_URL);
  // Check the server's certificate and hostname, so the connection can't be silently intercepted.
  url.searchParams.set('sslmode', 'verify-full');

  const adapter = new PrismaPg({
    connectionString: url.toString(),
    max: 10,
    // Neon pauses idle databases, and waking one can take a few seconds.
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({ adapter });
}

// One shared client, because each client holds its own pool of connections.
export const prisma = createPrismaClient();
