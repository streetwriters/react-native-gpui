import fs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import {
  collectNodeAddons,
  linuxBuildDependencyProblem,
  scanNodeAddonCalls,
} from './commands.js';

const repoRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

// --- collect-node-addons -----------------------------------------------------

test('the scanner reads every key/path pair a bundle emits', () => {
  const bundle = [
    'var a = _requireNodeLibrary("node_modules/pkg/prebuilds/x.node", "/app/node_modules/pkg/prebuilds/x.node");',
    'var b = _requireNodeLibrary(\n  "local/deadbeef/y.node",\n  "/app/build/Release/y.node"\n);',
  ].join('\n');
  expect(scanNodeAddonCalls(bundle)).toEqual([
    {
      key: 'node_modules/pkg/prebuilds/x.node',
      path: '/app/node_modules/pkg/prebuilds/x.node',
    },
    { key: 'local/deadbeef/y.node', path: '/app/build/Release/y.node' },
  ]);
});

test('the scanner reports one entry per key', () => {
  const bundle =
    '_requireNodeLibrary("a/x.node","/p/x.node");_requireNodeLibrary("a/x.node","/p/x.node");';
  expect(scanNodeAddonCalls(bundle)).toHaveLength(1);
});

test('the scanner ignores a call with only a key', () => {
  expect(scanNodeAddonCalls('_requireNodeLibrary("a/x.node")')).toEqual([]);
});

test('the scanner unescapes the path Babel emitted', () => {
  const bundle = String.raw`_requireNodeLibrary("local/1/a.node","C:\\app\\a.node");`;
  expect(scanNodeAddonCalls(bundle)[0].path).toBe('C:\\app\\a.node');
});

test('collect-node-addons copies each addon to <out>/<key>', () => {
  const root = fs.mkdtempSync(nodePath.join(repoRoot, '.local/collect-'));
  temporaryRoots.push(root);
  const addonPath = nodePath.join(root, 'build/Release/addon.node');
  fs.mkdirSync(nodePath.dirname(addonPath), { recursive: true });
  fs.writeFileSync(addonPath, 'binary');
  const bundlePath = nodePath.join(root, 'bundle.js');
  fs.writeFileSync(
    bundlePath,
    `_requireNodeLibrary("local/1/addon.node","${addonPath}");`,
  );
  const out = nodePath.join(root, 'node-addons');
  const result = collectNodeAddons({ bundle: bundlePath, out });
  expect(result.copied).toHaveLength(1);
  expect(
    fs.readFileSync(nodePath.join(out, 'local/1/addon.node'), 'utf8'),
  ).toBe('binary');
});

test('collect-node-addons copies sibling shared libraries', () => {
  const root = fs.mkdtempSync(nodePath.join(repoRoot, '.local/collect-'));
  temporaryRoots.push(root);
  const directory = nodePath.join(root, 'build/Release');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(nodePath.join(directory, 'addon.node'), 'binary');
  fs.writeFileSync(nodePath.join(directory, 'libdep.so'), 'shared');
  fs.writeFileSync(nodePath.join(directory, 'libdep.so.1'), 'shared');
  fs.writeFileSync(nodePath.join(directory, 'unrelated.txt'), 'no');
  const bundlePath = nodePath.join(root, 'bundle.js');
  fs.writeFileSync(
    bundlePath,
    `_requireNodeLibrary("local/1/addon.node","${nodePath.join(directory, 'addon.node')}");`,
  );
  const out = nodePath.join(root, 'node-addons');
  collectNodeAddons({ bundle: bundlePath, out, platform: 'linux' });
  expect(fs.existsSync(nodePath.join(out, 'local/1/libdep.so'))).toBe(true);
  expect(fs.existsSync(nodePath.join(out, 'local/1/libdep.so.1'))).toBe(true);
  expect(fs.existsSync(nodePath.join(out, 'local/1/unrelated.txt'))).toBe(
    false,
  );
});

test('collect-node-addons fails when an embedded path is gone', () => {
  const root = fs.mkdtempSync(nodePath.join(repoRoot, '.local/collect-'));
  temporaryRoots.push(root);
  const bundlePath = nodePath.join(root, 'bundle.js');
  fs.writeFileSync(
    bundlePath,
    '_requireNodeLibrary("local/1/gone.node","/nowhere/gone.node");',
  );
  expect(() =>
    collectNodeAddons({ bundle: bundlePath, out: nodePath.join(root, 'out') }),
  ).toThrow(/no longer exist/u);
});

test('collect-node-addons clears a stale directory when the bundle has none', () => {
  const root = fs.mkdtempSync(nodePath.join(repoRoot, '.local/collect-'));
  temporaryRoots.push(root);
  const bundlePath = nodePath.join(root, 'bundle.js');
  fs.writeFileSync(bundlePath, 'var x = 1;');
  const out = nodePath.join(root, 'node-addons');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(nodePath.join(out, 'stale'), 'x');
  const result = collectNodeAddons({ bundle: bundlePath, out });
  expect(result.copied).toEqual([]);
  expect(fs.existsSync(out)).toBe(false);
});

test('collect-node-addons requires both arguments', () => {
  expect(() => collectNodeAddons({})).toThrow(/--bundle/u);
  expect(() => collectNodeAddons({ bundle: 'x' })).toThrow(/--out/u);
});
