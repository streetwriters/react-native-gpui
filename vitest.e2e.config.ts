import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    globals: true,
    include: ['packages/rn-gpui-tester/e2e/**/*.e2e.ts'],
    setupFiles: ['packages/rn-gpui-tester/e2e/vitest.setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 45_000,
    maxWorkers: 4,
  },
});
