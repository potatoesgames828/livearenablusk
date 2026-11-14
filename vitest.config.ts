import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/src/**/*.test.ts', 'games/**/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          pool: 'forks',
        },
      },
    ],
  },
});
