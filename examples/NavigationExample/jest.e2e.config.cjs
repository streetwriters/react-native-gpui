module.exports = {
  rootDir: __dirname,
  preset: '@react-native-gpui/testing/jest-preset-e2e',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
};
