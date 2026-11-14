import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Specs that put a visible window on screen, or change machine-wide state
// (the single-instance app, memory pressure, another app's process), fight each
// other and the user's focus when they run together, so they run one at a time.
// Every other spec runs offscreen and shares nothing, so those run in parallel.
const serial = [
  'apis-onscreen',
  'background',
  'desktop-shell-menu-bar',
  'display',
  'display-scale',
  'fixtures',
  'hidden-start',
  'metro',
  'native-views',
].map(name => `packages/rn-gpui-tester/e2e/${name}.e2e.ts`);

// run-e2e.mjs runs the two passes one after the other; without a pass set,
// everything runs serially, as before.
const pass = process.env.RN_GPUI_E2E_PASS;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    globals: true,
    include:
      pass === 'serial' ? serial : ['packages/rn-gpui-tester/e2e/**/*.e2e.ts'],
    exclude: pass === 'parallel' ? serial : ['**/node_modules/**'],
    setupFiles: ['packages/rn-gpui-tester/e2e/vitest.setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 45_000,
    fileParallelism: pass === 'parallel',
  },
});
