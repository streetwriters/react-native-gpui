import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['examples/NavigationExample/e2e/**/*.e2e.ts'],
    setupFiles: ['tester/e2e/vitest.setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 45_000,
    maxWorkers: 4,
  },
});
