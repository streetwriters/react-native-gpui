import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import gpuiPreset from '@react-native-gpui/testing/vitest-preset';

export default mergeConfig(
  defineConfig(gpuiPreset),
  defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    test: {
      include: [
        'packages/rn-gpui-tester/vitest/**/*.test.{js,ts,tsx}',
        'packages/@react-native-gpui/cli/src/**/*.test.js',
        'packages/@react-native-gpui/codegen/src/**/*.test.js',
      ],
    },
  }),
);
