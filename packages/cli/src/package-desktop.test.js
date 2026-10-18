import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildLibraryDirectories,
  libraryExtension,
  runtimeLibraries,
} from './package-desktop.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

/** A project with an autolink manifest and whatever files are asked for. */
function createProject({ engines = [], files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-package-'));
  roots.push(root);
  write(root, 'package.json', { name: 'my-app' });
  if (engines.length > 0) {
    write(root, 'desktop/autolink/autolink.json', { jsEngines: engines });
  }
  for (const [relative, contents] of Object.entries(files)) {
    write(root, relative, contents);
  }
  return root;
}

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof contents === 'string'
      ? contents
      : `${JSON.stringify(contents, null, 2)}\n`,
  );
}

describe('libraryExtension', () => {
  test('each OS has its own shared-library extension', () => {
    expect(libraryExtension('macos')).toBe('.dylib');
    expect(libraryExtension('windows')).toBe('.dll');
    expect(libraryExtension('linux')).toBe('.so');
  });
});

describe('runtimeLibraries', () => {
  test('an engine that names its own files is read from its module', () => {
    const root = createProject();
    const engineDir = path.join(root, 'engine');
    fs.mkdirSync(engineDir, { recursive: true });
    const library = path.join(engineDir, 'libhermesvm.dylib');
    fs.writeFileSync(library, 'x');
    fs.writeFileSync(
      path.join(engineDir, 'runtime-files.js'),
      `const path = require('node:path');
       module.exports = (platform) =>
         platform === 'darwin' ? [path.join(__dirname, 'libhermesvm.dylib')] : [];
      `,
    );
    write(root, 'desktop/autolink/autolink.json', {
      jsEngines: [
        {
          name: 'hermes',
          runtimeFiles: path.join(engineDir, 'runtime-files.js'),
        },
      ],
    });

    // The engine resolves its own directory, which on macOS reaches the same
    // file through the `/var` -> `/private/var` symlink.
    const libs = runtimeLibraries(root, { os: 'darwin', arch: 'arm64' });
    expect(libs.map(file => fs.realpathSync(file))).toContain(
      fs.realpathSync(library),
    );
  });

  test('a library the engine does not name for this platform is skipped', () => {
    const root = createProject();
    const engineDir = path.join(root, 'engine');
    fs.mkdirSync(engineDir, { recursive: true });
    fs.writeFileSync(path.join(engineDir, 'libhermesvm.dylib'), 'x');
    fs.writeFileSync(
      path.join(engineDir, 'runtime-files.js'),
      `const path = require('node:path');
       module.exports = (platform) =>
         platform === 'darwin' ? [path.join(__dirname, 'libhermesvm.dylib')] : [];
      `,
    );
    write(root, 'desktop/autolink/autolink.json', {
      jsEngines: [
        {
          name: 'hermes',
          runtimeFiles: path.join(engineDir, 'runtime-files.js'),
        },
      ],
    });

    expect(runtimeLibraries(root, { os: 'win32', arch: 'x64' })).toEqual([]);
  });

  test('shared libraries the build produced are found beside the target', () => {
    const root = createProject();
    write(root, 'desktop/target/release/libruntime.dylib', 'x');
    write(root, 'desktop/target/release/notes.txt', 'not a library');
    const libs = runtimeLibraries(root, { os: 'darwin', arch: 'arm64' });
    expect(libs.map(file => path.basename(file))).toEqual(['libruntime.dylib']);
  });

  test('the sys crate build output is scanned, keyed by its hash', () => {
    const root = createProject();
    write(
      root,
      'desktop/target/release/build/rn-gpui-sys-abc123/out/libjsi.dylib',
      'x',
    );
    const libs = runtimeLibraries(root, { os: 'darwin', arch: 'arm64' });
    expect(libs.map(file => path.basename(file))).toEqual(['libjsi.dylib']);
  });

  test('a versioned Linux library counts as a library', () => {
    const root = createProject();
    write(root, 'desktop/target/release/libfoo.so.1.2.3', 'x');
    write(root, 'desktop/target/release/libfoo.so', 'x');
    const libs = runtimeLibraries(root, { os: 'linux', arch: 'x64' });
    expect(libs.map(file => path.basename(file)).sort()).toEqual([
      'libfoo.so',
      'libfoo.so.1.2.3',
    ]);
  });

  test('a library for another OS is not shipped', () => {
    const root = createProject();
    write(root, 'desktop/target/release/libfoo.dylib', 'x');
    expect(runtimeLibraries(root, { os: 'win32', arch: 'x64' })).toEqual([]);
  });

  test('a debug build reads the debug profile', () => {
    const root = createProject();
    write(root, 'desktop/target/debug/libruntime.dylib', 'x');
    write(root, 'desktop/target/release/librelease.dylib', 'x');
    expect(
      runtimeLibraries(root, {
        os: 'darwin',
        arch: 'arm64',
        release: false,
      }).map(file => path.basename(file)),
    ).toEqual(['libruntime.dylib']);
  });

  test('a project with no autolink manifest ships no engine files', () => {
    const root = createProject();
    expect(runtimeLibraries(root, { os: 'darwin', arch: 'arm64' })).toEqual([]);
  });

  test('the same library named twice is shipped once', () => {
    const root = createProject();
    write(root, 'desktop/target/release/libfoo.dylib', 'x');
    const libs = runtimeLibraries(root, { os: 'darwin', arch: 'arm64' });
    expect(new Set(libs).size).toBe(libs.length);
  });
});

describe('buildLibraryDirectories', () => {
  test('the release and debug profiles are distinct', () => {
    const root = createProject();
    expect(buildLibraryDirectories(root, { release: true })[0]).toContain(
      path.join('desktop', 'target', 'release'),
    );
    expect(buildLibraryDirectories(root, { release: false })[0]).toContain(
      path.join('desktop', 'target', 'debug'),
    );
  });
});
