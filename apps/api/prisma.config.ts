import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a direct connection: Neon's pooler does not support everything they do.
    // Read directly so that `prisma generate`, which needs no database, works without this set.
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
});
