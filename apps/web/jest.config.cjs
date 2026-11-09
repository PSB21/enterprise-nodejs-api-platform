// next/jest compiles TypeScript and JSX with Next's own compiler and loads next.config.
const nextJest = require('next/jest.js');

const createJestConfig = nextJest({ dir: __dirname });

/** @type {import('jest').Config} */
module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
});
