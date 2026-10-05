module.exports = {
  ...require('@react-native/jest-preset'),
  testEnvironment: require.resolve('./jest-environment.cjs'),
  testMatch: ['**/e2e/**/*.e2e.{js,ts,tsx}'],
  globalSetup: require.resolve('./global-setup.cjs'),
  globalTeardown: require.resolve('./global-teardown.cjs'),
  testTimeout: 60000,
  maxWorkers: '50%',
};
