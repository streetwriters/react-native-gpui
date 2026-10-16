import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import gpuiPreset from '@react-native-gpui/testing/vitest-preset';

export default mergeConfig(
  defineConfig(gpuiPreset),
  defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    test: {
      include: [
        'scripts/ci/**/*.test.mjs',
        'packages/rn-gpui-tester/vitest/**/*.test.{js,ts,tsx}',
        'packages/cli/src/**/*.test.js',
        'packages/codegen/src/**/*.test.js',
        'packages/hermes/gpui/**/*.test.js',
        'packages/hermes/scripts/**/*.test.mjs',
        'packages/core/**/*.test.js',
        'packages/core/**/*.test.mjs',
      ],
    },
  }),
);
