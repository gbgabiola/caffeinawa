import 'dotenv/config';

import { defineConfig } from 'vitest/config';

import { assertTestDatabaseEnvironment } from './test/database-environment.js';

assertTestDatabaseEnvironment();

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
});
