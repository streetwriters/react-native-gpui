import { vi } from 'vitest';

// React Native's test helpers use the Jest mock API by name. Keep their common
// subset available when the same tests run under Vitest.
Object.assign(globalThis, {
  jest: vi,
  IS_REACT_ACT_ENVIRONMENT: true,
});
