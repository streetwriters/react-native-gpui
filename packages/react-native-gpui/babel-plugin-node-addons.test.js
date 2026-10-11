import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { afterAll, expect, test } from 'vitest';
import plugin, {
  addonKey,
  isHostPrebuiltNodeAddon,
  resolveAddon,
} from './babel-plugin-node-addons.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** A scratch directory whose real path is stable for the test's duration. */
function scratch() {
  const root = fs.mkdtempSync(path.join(packageRoot, '.node-addons-test-'));
  temporaryRoots.push(root);
  // `mkdtempSync` under /var on macOS is a symlink farm; resolve it once so
  // expectations about the key match what the plugin sees.
  return fs.realpathSync(root);
}

function write(filePath, contents = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function transform(source, { filename, platform = 'gpui', ...options }) {
  return transformSync(source, {
    filename,
    caller: { name: 'metro', bundler: 'metro', platform },
    configFile: false,
    babelrc: false,
    plugins: [[plugin, options]],
    compact: false,
  }).code;
}

/**
 * A file that passes the host guard on the host the test runs on. The guard
 * reads real bytes, so a valid header has to be written rather than a text
 * placeholder.
 */
function hostAddonHeader() {
  if (process.platform === 'linux') {
    const header = Buffer.alloc(20);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(header, 0);
    header.writeUInt16LE(process.arch === 'arm64' ? 0xb7 : 0x3e, 18);
    return header;
  }
  if (process.platform === 'darwin') {
    // 64-bit thin little-endian Mach-O for the host CPU.
    const header = Buffer.alloc(32);
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(header, 0);
    header.writeUInt32LE(process.arch === 'arm64' ? 0x0100000c : 0x01000007, 4);
    return header;
  }
  return Buffer.from('not a real binary');
}

/** A file the host guard rejects: an ELF for the other architecture. */
function foreignAddonHeader() {
  if (process.platform === 'darwin') {
    const header = Buffer.alloc(32);
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(header, 0);
    header.writeUInt32LE(process.arch === 'arm64' ? 0x01000007 : 0x0100000c, 4);
    return header;
  }
  const header = Buffer.alloc(20);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(header, 0);
  header.writeUInt16LE(process.arch === 'arm64' ? 0x3e : 0xb7, 18);
  return header;
}

function writeAddon(filePath, header = hostAddonHeader()) {
  write(filePath, header);
}

/** The `_requireNodeLibrary(...)` arguments in transformed code. */
function callsIn(code) {
  const calls = [];
  const pattern =
    /_requireNodeLibrary\(\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"((?:[^"\\]|\\.)*)")?\s*\)/gu;
  for (const match of code.matchAll(pattern)) {
    calls.push({ key: match[1], path: match[2] });
  }
  return calls;
}

test('rewrites a relative .node require on gpui', () => {
  const root = scratch();
  const addon = path.join(root, 'build/Release/addon.node');
  writeAddon(addon);
  const code = transform(
    "const addon = require('./build/Release/addon.node');",
    {
      filename: path.join(root, 'index.js'),
    },
  );
  expect(code).toContain('_requireNodeLibrary');
  expect(code).not.toContain('require(');
  const [call] = callsIn(code);
  expect(call.key).toBe(`local/${addonKey(addon).split('/')[1]}/addon.node`);
  expect(call.path).toBe(addon);
});

test('leaves the require untouched on ios and android', () => {
  const root = scratch();
  writeAddon(path.join(root, 'addon.node'));
  const source = "const addon = require('./addon.node');";
  for (const platform of ['ios', 'android', 'web']) {
    const code = transform(source, {
      filename: path.join(root, 'index.js'),
      platform,
    });
    expect(code).toContain("require('./addon.node')");
    expect(code).not.toContain('_requireNodeLibrary');
  }
});

test('rewrites every import form', () => {
  const root = scratch();
  writeAddon(path.join(root, 'thing.node'));
  const filename = path.join(root, 'index.js');
  const cases = [
    [
      "import binding from './thing.node';",
      /const _nodeAddonExports = _requireNodeLibrary\(/u,
    ],
    [
      "import * as binding from './thing.node';",
      /const binding = _nodeAddonExports/u,
    ],
    [
      "import { add, sub as minus } from './thing.node';",
      /const \{\s+add: add,\s+sub: minus\s+\} = _nodeAddonExports/u,
    ],
    ["import './thing.node';", /^_requireNodeLibrary\(/mu],
  ];
  for (const [source, pattern] of cases) {
    const code = transform(source, { filename });
    expect(code, source).toMatch(pattern);
    expect(code, source).toContain('_requireNodeLibrary(');
  }
});

test('a bare .node specifier resolves through node resolution', () => {
  const root = scratch();
  const addon = path.join(
    root,
    'node_modules/some-package/prebuilds/thing.node',
  );
  write(filePathIn(root, 'node_modules/some-package/package.json'), '{}');
  writeAddon(addon);
  const code = transform("require('some-package/prebuilds/thing.node');", {
    filename: path.join(root, 'index.js'),
  });
  const [call] = callsIn(code);
  expect(call.path).toBe(addon);
  expect(call.key).toBe('node_modules/some-package/prebuilds/thing.node');
});

test('a missing .node file becomes a throwing expression with a code', () => {
  const root = scratch();
  const code = transform("require('./missing.node');", {
    filename: path.join(root, 'index.js'),
  });
  expect(code).toContain("Cannot find module './missing.node'");
  expect(code).toContain('MODULE_NOT_FOUND');
  expect(code).not.toContain('_requireNodeLibrary');
});

test('a surrounding try/catch catches the throwing expression', () => {
  const root = scratch();
  const code = transform(
    "let value; try { value = require('./missing.node'); } catch (error) { value = error.code; }",
    { filename: path.join(root, 'index.js') },
  );
  // Evaluated in a bare VM context so the assertion is about the emitted
  // expression, not about this test file's scope.
  const result = vm.runInNewContext(`${code}\nvalue;`, {});
  expect(result).toBe('MODULE_NOT_FOUND');
});

test('R2 fires only when nothing else would resolve', () => {
  const root = scratch();
  const filename = path.join(root, 'index.js');
  writeAddon(path.join(root, 'only.node'));
  expect(transform("require('./only');", { filename })).toContain(
    '_requireNodeLibrary',
  );

  // With a real .js sibling the require must be left alone.
  write(path.join(root, 'both.js'), 'module.exports = {};');
  writeAddon(path.join(root, 'both.node'));
  expect(transform("require('./both');", { filename })).toContain(
    "require('./both')",
  );

  // With a directory of that name, likewise.
  write(path.join(root, 'dir/index.js'), 'module.exports = {};');
  writeAddon(path.join(root, 'dir.node'));
  expect(transform("require('./dir');", { filename })).toContain(
    "require('./dir')",
  );

  // With a package.json in the directory, likewise.
  write(path.join(root, 'pkg/package.json'), '{"main":"x.js"}');
  writeAddon(path.join(root, 'pkg.node'));
  expect(transform("require('./pkg');", { filename })).toContain(
    "require('./pkg')",
  );
});

test('R3 rewrites a bare package whose main is an addon', () => {
  const root = scratch();
  const addon = path.join(root, 'node_modules/native-thing/index.node');
  write(
    path.join(root, 'node_modules/native-thing/package.json'),
    JSON.stringify({ name: 'native-thing', main: 'index.node' }),
  );
  writeAddon(addon);
  const code = transform("require('native-thing');", {
    filename: path.join(root, 'index.js'),
  });
  const [call] = callsIn(code);
  expect(call.key).toBe('node_modules/native-thing/index.node');
  expect(call.path).toBe(addon);
});

test('a bare package whose main is JavaScript is left alone', () => {
  const root = scratch();
  write(
    path.join(root, 'node_modules/plain-thing/package.json'),
    JSON.stringify({ name: 'plain-thing', main: 'index.js' }),
  );
  write(path.join(root, 'node_modules/plain-thing/index.js'), '');
  expect(
    transform("require('plain-thing');", {
      filename: path.join(root, 'index.js'),
    }),
  ).toContain("require('plain-thing')");
});

test('key: everything from the first node_modules segment', () => {
  const root = scratch();
  const addon = path.join(
    root,
    'node_modules/a/node_modules/b/prebuilds/x.node',
  );
  writeAddon(addon);
  expect(addonKey(addon)).toBe(
    'node_modules/a/node_modules/b/prebuilds/x.node',
  );
});

test('key: the local form for a path outside node_modules', () => {
  const root = scratch();
  const addon = path.join(root, 'build/Release/addon.node');
  writeAddon(addon);
  const key = addonKey(addon);
  expect(key).toMatch(/^local\/[0-9a-f]{8}\/addon\.node$/u);
  expect(key).not.toContain('..');
  expect(key.startsWith('/')).toBe(false);
});

test('key: a symlinked package directory uses the real path', () => {
  const root = scratch();
  const real = path.join(root, 'real-package/prebuilds/x.node');
  write(filePathIn(root, 'real-package/package.json'), '{}');
  writeAddon(real);
  const link = path.join(root, 'node_modules/linked-package');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(path.dirname(path.dirname(real)), link, 'dir');
  const code = transform("require('linked-package/prebuilds/x.node');", {
    filename: path.join(root, 'index.js'),
  });
  const [call] = callsIn(code);
  // The key comes from the real path (section 3.3), and a symlinked workspace
  // package resolves outside node_modules, so it takes the `local/` form —
  // the same key the real path produces when required directly, which is the
  // invariant that matters: one file, one key, whichever way it is reached.
  expect(call.key).toBe(addonKey(real));
  expect(call.key).toMatch(/^local\/[0-9a-f]{8}\/x\.node$/u);
});

test('embedPaths: false omits the second argument', () => {
  const root = scratch();
  writeAddon(path.join(root, 'addon.node'));
  const code = transform("require('./addon.node');", {
    filename: path.join(root, 'index.js'),
    embedPaths: false,
  });
  expect(code).toMatch(/_requireNodeLibrary\("[^"]+"\)/u);
  expect(callsIn(code)[0].path).toBeUndefined();
});

test('a binary for another platform is treated as missing', () => {
  const root = scratch();
  const addon = path.join(root, 'foreign.node');
  write(addon, foreignAddonHeader());
  expect(isHostPrebuiltNodeAddon(addon, process.platform, process.arch)).toBe(
    false,
  );
  const code = transform("require('./foreign.node');", {
    filename: path.join(root, 'index.js'),
  });
  expect(code).toContain('MODULE_NOT_FOUND');
  expect(code).not.toContain('_requireNodeLibrary');
});

test('a path segment naming another platform is rejected without reading', () => {
  const root = scratch();
  const addon = path.join(root, 'prebuilds/win32-x64/thing.node');
  writeAddon(addon);
  expect(isHostPrebuiltNodeAddon(addon, process.platform, process.arch)).toBe(
    false,
  );
});

test('the host platform and arch are options, so tests run anywhere', () => {
  const root = scratch();
  const linuxX64 = Buffer.alloc(20);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(linuxX64, 0);
  linuxX64.writeUInt16LE(0x3e, 18);
  const addon = path.join(root, 'linux.node');
  write(addon, linuxX64);

  expect(isHostPrebuiltNodeAddon(addon, 'linux', 'x64')).toBe(true);
  expect(isHostPrebuiltNodeAddon(addon, 'linux', 'arm64')).toBe(false);

  const code = transform("require('./linux.node');", {
    filename: path.join(root, 'index.js'),
    hostPlatform: 'linux',
    hostArch: 'x64',
  });
  expect(code).toContain('_requireNodeLibrary');

  const foreign = transform("require('./linux.node');", {
    filename: path.join(root, 'index.js'),
    hostPlatform: 'linux',
    hostArch: 'arm64',
  });
  expect(foreign).toContain('MODULE_NOT_FOUND');
});

test('a universal Mach-O with a host slice is accepted', () => {
  const root = scratch();
  const fat = Buffer.alloc(8 + 2 * 20);
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]).copy(fat, 0);
  fat.writeUInt32BE(2, 4);
  fat.writeUInt32BE(0x01000007, 8); // x86_64
  fat.writeUInt32BE(0x0100000c, 8 + 20); // arm64
  const addon = path.join(root, 'universal.node');
  write(addon, fat);
  expect(isHostPrebuiltNodeAddon(addon, 'darwin', 'arm64')).toBe(true);
  expect(isHostPrebuiltNodeAddon(addon, 'darwin', 'x64')).toBe(true);
});

test('a universal Mach-O without a host slice is rejected', () => {
  const root = scratch();
  const fat = Buffer.alloc(8 + 20);
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]).copy(fat, 0);
  fat.writeUInt32BE(1, 4);
  fat.writeUInt32BE(0x01000007, 8); // x86_64 only
  const addon = path.join(root, 'intel-only.node');
  write(addon, fat);
  expect(isHostPrebuiltNodeAddon(addon, 'darwin', 'arm64')).toBe(false);
  expect(isHostPrebuiltNodeAddon(addon, 'darwin', 'x64')).toBe(true);
});

test('resolveAddon reports a non-addon specifier as null', () => {
  const root = scratch();
  write(path.join(root, 'plain.js'), '');
  expect(
    resolveAddon('./plain', root, {
      hostPlatform: process.platform,
      hostArch: process.arch,
    }),
  ).toBeNull();
  expect(
    resolveAddon('react', root, {
      hostPlatform: process.platform,
      hostArch: process.arch,
    }),
  ).toBeNull();
});

test('a dynamic import and a computed require are left alone', () => {
  const root = scratch();
  writeAddon(path.join(root, 'addon.node'));
  const filename = path.join(root, 'index.js');
  expect(transform("import('./addon.node');", { filename })).toContain(
    "import('./addon.node')",
  );
  expect(transform('require(name);', { filename })).toContain('require(name)');
  expect(transform('require(`./addon.node`);', { filename })).toContain(
    'require(`./addon.node`)',
  );
});

test('the key never contains a backslash or a parent segment', () => {
  const root = scratch();
  const addon = path.join(root, 'build/Release/addon.node');
  writeAddon(addon);
  const key = addonKey(addon);
  expect(key).not.toContain('\\');
  expect(key.split('/')).not.toContain('..');
});

function filePathIn(root, relative) {
  return path.join(root, relative);
}
