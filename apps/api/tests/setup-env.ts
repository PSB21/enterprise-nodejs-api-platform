// Runs before every test file. dotenv never overwrites a variable that is already set, so this
// placeholder guarantees tests can't reach the real database through apps/api/.env.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
