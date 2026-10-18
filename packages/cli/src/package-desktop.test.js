import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildLibraryDirectories,
  CARGO_PACKAGER_VERSION,
  libraryExtension,
  runtimeLibraries,
  targetProfileDir,
  toPackagerConfig,
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

// The translator is the whole reason cargo-packager is an implementation
// detail: these hold what it emits for one config, so replacing the packager
// only changes one function and one set of expectations.
test('the packager version is pinned to one release', () => {
  // The translator emits this version's schema, and `ensureCargoPackager`
  // installs it, so the two cannot drift apart.
  expect(CARGO_PACKAGER_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
});

describe('toPackagerConfig', () => {
  const desktopConfig = overrides => {
    const { bundle: bundleOverrides, ...rest } = overrides ?? {};
    return {
      productName: 'My App',
      identifier: 'com.example.myapp',
      version: '1.2.3',
      window: { width: 1024, height: 768 },
      devMenu: true,
      ...rest,
      bundle: {
        targets: 'all',
        resources: [],
        macos: {
          minimumSystemVersion: '13.0',
          entitlements: null,
          infoPlist: {},
        },
        windows: { nsis: { installMode: 'currentUser' } },
        linux: { deb: { depends: [] }, appimage: {} },
        ...bundleOverrides,
      },
    };
  };
  const build = overrides => ({
    crateDir: '/project/desktop',
    binaryName: 'my-app',
    formats: ['app', 'dmg'],
    ...overrides,
  });

  test('a minimal app gives the fields cargo-packager needs', () => {
    const config = toPackagerConfig(desktopConfig(), build());
    expect(config.productName).toBe('My App');
    expect(config.identifier).toBe('com.example.myapp');
    expect(config.version).toBe('1.2.3');
    expect(config.binariesDir).toBe('/project/desktop/target/release');
    expect(config.binaries).toEqual([{ path: 'my-app', main: true }]);
    expect(config.formats).toEqual(['app', 'dmg']);
    expect(config.outDir).toBe('/project/desktop/build/dist');
  });

  test('the bundle file and the assets directory ship as resources', () => {
    // A directory containing this run's output cannot be shipped, so the two
    // are named. The asset directory has to exist to be listed.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-res-'));
    roots.push(root);
    const crateDir = path.join(root, 'desktop');
    fs.mkdirSync(path.join(crateDir, 'build', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(crateDir, 'build', 'index.bundle'), 'x');
    const config = toPackagerConfig(
      desktopConfig(),
      build({
        crateDir,
        bundleDir: path.join(crateDir, 'build'),
        assetsDir: path.join(crateDir, 'build', 'assets'),
      }),
    );
    expect(config.resources).toEqual(['build/index.bundle', 'build/assets']);
  });

  test('a bytecode bundle is shipped when that is what the build made', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-res-'));
    roots.push(root);
    const crateDir = path.join(root, 'desktop');
    fs.mkdirSync(path.join(crateDir, 'build'), { recursive: true });
    fs.writeFileSync(path.join(crateDir, 'build', 'index.bundle.hbc'), 'x');
    const config = toPackagerConfig(
      desktopConfig(),
      build({ crateDir, bundleDir: path.join(crateDir, 'build') }),
    );
    expect(config.resources).toEqual(['build/index.bundle.hbc']);
  });

  test('extra resources are relative to the crate', () => {
    const config = toPackagerConfig(
      desktopConfig({ bundle: { resources: ['extra/data.json'] } }),
      build(),
    );
    expect(config.resources).toEqual(['extra/data.json']);
  });

  test('runtime libraries become macOS frameworks, by source path', () => {
    // cargo-packager copies each entry into Contents/Frameworks itself, so the
    // entry is where the library is, not where it lands.
    const config = toPackagerConfig(
      desktopConfig(),
      build({ libraries: ['/project/desktop/build/libjsi.dylib'] }),
    );
    expect(config.macos.frameworks).toEqual([
      '/project/desktop/build/libjsi.dylib',
    ]);
  });

  test('runtime libraries land in the Linux lib directory', () => {
    const config = toPackagerConfig(
      desktopConfig(),
      build({ libraries: ['/build/libjsi.so'] }),
    );
    expect(config.deb.files).toEqual({
      '/build/libjsi.so': '/usr/lib/my-app/libjsi.so',
    });
    expect(config.appimage.files).toEqual({
      '/build/libjsi.so': '/usr/lib/my-app/libjsi.so',
    });
  });

  test('no libraries means no empty framework or files block', () => {
    const config = toPackagerConfig(desktopConfig(), build());
    expect(config.macos.frameworks).toBeUndefined();
    expect(config.deb).toBeUndefined();
    expect(config.appimage).toBeUndefined();
  });

  test('the NSIS install mode is carried over', () => {
    const config = toPackagerConfig(
      desktopConfig({
        bundle: { windows: { nsis: { installMode: 'perMachine' } } },
      }),
      build({ formats: ['nsis'] }),
    );
    expect(config.nsis).toEqual({ installMode: 'perMachine' });
  });

  test('Debian dependencies are carried over', () => {
    const config = toPackagerConfig(
      desktopConfig({
        bundle: { linux: { deb: { depends: ['libgtk-3-0'] } } },
      }),
      build({ formats: ['deb'] }),
    );
    expect(config.deb.depends).toEqual(['libgtk-3-0']);
  });

  test('a copyright and category reach the output when set', () => {
    const config = toPackagerConfig(
      desktopConfig({
        bundle: { copyright: '© 2026 Me', category: 'DeveloperTool' },
      }),
      build(),
    );
    expect(config.copyright).toBe('© 2026 Me');
    expect(config.category).toBe('DeveloperTool');
  });

  // D6: signing material comes from the environment, so no value of it may
  // appear in the generated config, whatever the caller's environment holds.
  test('no signing material appears in the output', () => {
    const secrets = ['SUPER-SECRET', 'ANOTHER-SECRET', 'CERT-PASSWORD'];
    process.env.APPLE_SIGNING_IDENTITY = secrets[0];
    process.env.APPLE_CERTIFICATE = secrets[1];
    process.env.APPLE_CERTIFICATE_PASSWORD = secrets[2];
    try {
      const text = JSON.stringify(toPackagerConfig(desktopConfig(), build()));
      for (const secret of secrets) expect(text).not.toContain(secret);
    } finally {
      delete process.env.APPLE_SIGNING_IDENTITY;
      delete process.env.APPLE_CERTIFICATE;
      delete process.env.APPLE_CERTIFICATE_PASSWORD;
    }
  });

  test('paths use forward slashes on every platform', () => {
    const config = toPackagerConfig(
      desktopConfig(),
      build({
        crateDir: '/project/desktop',
        bundleDir: '/project/desktop/build',
      }),
    );
    for (const entry of [...config.resources, config.binaries[0].path]) {
      expect(entry).not.toContain('\\');
    }
  });
});

describe('targetProfileDir', () => {
  test('a crate with no cargo config uses target/<profile>', () => {
    const root = createProject();
    expect(targetProfileDir(path.join(root, 'desktop'), 'release')).toBe(
      path.join(root, 'desktop', 'target', 'release'),
    );
  });

  test("the crate's target-dir setting wins", () => {
    // The scaffold redirects `target-dir` to `build/target` so build output does
    // not sit beside the sources; `target/release` then does not exist at all.
    const root = createProject({
      files: {
        'desktop/.cargo/config.toml': '[build]\ntarget-dir = "build/target"\n',
      },
    });
    expect(targetProfileDir(path.join(root, 'desktop'), 'release')).toBe(
      path.join(root, 'desktop', 'build', 'target', 'release'),
    );
  });
});
