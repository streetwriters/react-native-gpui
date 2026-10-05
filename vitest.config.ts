import { defineConfig, mergeConfig } from 'vitest/config';
import gpuiPreset from '@react-native-gpui/testing/vitest-preset';

export default mergeConfig(
  defineConfig(gpuiPreset),
  defineConfig({
    test: {
      include: ['tester/vitest/**/*.test.{js,ts,tsx}'],
    },
  }),
);
