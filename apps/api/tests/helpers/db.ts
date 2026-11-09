import { prisma } from '../../src/db/prisma';

/** Fails clearly when a test that needs Postgres runs without a test database. */
export function requireTestDatabase() {
  if (process.env.HAS_TEST_DATABASE !== 'true') {
    throw new Error('This test needs TEST_DATABASE_URL. See the README.');
  }
}

/** Empties every Postgres table, so each test starts from a known state. */
export async function resetPostgres() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
}
