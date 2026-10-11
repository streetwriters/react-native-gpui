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

test('the Linux preflight gives one package name per distribution', () => {
  const problem = linuxBuildDependencyProblem('linux', pc => pc !== 'gtk+-3.0');
  expect(problem).toContain('Debian/Ubuntu: sudo apt install libgtk-3-dev');
  expect(problem).toContain('Fedora: sudo dnf install gtk3-devel');
  expect(problem).toContain('Arch: sudo pacman -S gtk3');
});

test('the Linux preflight prints the computed system pkg-config path', () => {
  const path = '/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig';
  const problem = linuxBuildDependencyProblem(
    'linux',
    () => false,
    () => path,
  );
  expect(problem).toContain(`PKG_CONFIG_PATH=${path}`);
});

test('the Linux preflight falls back when the system path is unknown', () => {
  const problem = linuxBuildDependencyProblem(
    'linux',
    () => false,
    () => null,
  );
  expect(problem).not.toContain('PKG_CONFIG_PATH=');
  expect(problem).toContain('point PKG_CONFIG_PATH at your system pkgconfig');
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
