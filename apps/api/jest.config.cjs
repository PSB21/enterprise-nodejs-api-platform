/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/global-setup.ts',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  // Tests share one database, so test files run one at a time to avoid deleting each other's data.
  maxWorkers: 1,
  testTimeout: 30_000,
  // Prisma's generated TypeScript imports its sibling files with a .js extension.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/generated/**', '!src/**/*.d.ts'],
};
