import { expect, test } from 'vitest';
import { linuxBuildDependencyProblem } from './commands.js';

test('the Linux preflight accepts a complete system', () => {
  expect(linuxBuildDependencyProblem('linux', () => true)).toBeNull();
});

test('the Linux preflight names the missing module and its package', () => {
  const problem = linuxBuildDependencyProblem('linux', pc =>
    pc === 'gtk+-3.0' ? true : false,
  );
  expect(problem).toContain('ayatana-appindicator3-0.1');
  expect(problem).toContain('libayatana-appindicator3-dev');
  expect(problem).toContain('PKG_CONFIG_PATH');
});

test('the Linux preflight reports a missing pkg-config', () => {
  expect(
    linuxBuildDependencyProblem('linux', () => 'missing-pkg-config'),
  ).toContain('pkg-config is required');
});

test('the Linux preflight is a no-op on other platforms', () => {
  expect(linuxBuildDependencyProblem('darwin', () => false)).toBeNull();
  expect(linuxBuildDependencyProblem('win32', () => false)).toBeNull();
});
