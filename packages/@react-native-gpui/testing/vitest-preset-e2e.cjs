const path = require('node:path');
module.exports = {
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.join(__dirname, 'vitest/e2e-setup.ts')],
    globalSetup: path.join(__dirname, 'global-setup.cjs'),
    testTimeout: 60000,
    hookTimeout: 45000,
    maxWorkers: '50%',
  },
};
