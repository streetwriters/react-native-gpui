import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import {
  autolink,
  findPrebuiltNodeApiModules,
  isHostPrebuiltNodeAddon,
} from './autolink.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const temporaryRoots = [];

const spec = `import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  greet(name: string): string;
  loadLater(name: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Fake');
`;

/**
 * A project small enough for autolink to run end to end: a manifest to resolve
 * from, a desktop Cargo manifest, one JS engine, and one C++ TurboModule
 * package. It lives under the repo so Node resolves the workspace packages.
 */
function createProject({
  withCodegenConfig = true,
  duplicateLibrary = false,
  collidingPrebuiltAddon = false,
} = {}) {
  const projectRoot = fs.mkdtempSync(path.join(repoRoot, '.local/autolink-'));
  temporaryRoots.push(projectRoot);
  const write = (relative, contents) => {
    const target = path.join(projectRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  write(
    'package.json',
    `${JSON.stringify({ name: 'autolink-test-app', version: '0.0.1' }, null, 2)}\n`,
  );
  write(
    'desktop/Cargo.toml',
    '[package]\nname = "autolink-test-app"\nversion = "0.0.1"\nedition = "2021"\n\n[dependencies]\n',
  );
  write(
    'node_modules/fake-engine/package.json',
    `${JSON.stringify({ name: 'fake-engine', version: '0.0.1' }, null, 2)}\n`,
  );
  const moduleManifest = {
    name: 'fake-module',
    version: '0.0.1',
    ...(withCodegenConfig
      ? {
          codegenConfig: {
            name: 'FakeSpec',
            type: 'modules',
            jsSrcsDir: 'src',
          },
        }
      : {}),
  };
  write(
    'node_modules/fake-module/package.json',
    `${JSON.stringify(moduleManifest, null, 2)}\n`,
  );
  write('node_modules/fake-module/src/NativeFake.ts', spec);
  write(
    'node_modules/fake-module/gpui/CMakeLists.txt',
    'set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES "${CMAKE_CURRENT_LIST_DIR}/cpp/FakeModule.cpp")\n',
  );
  write('node_modules/fake-module/cpp/FakeModule.cpp', '// fake module\n');
  write(
    'node_modules/fake-module/react-native.config.js',
    "module.exports = {dependency: {platforms: {gpui: {cmake: 'gpui', cppProvider: 'create_fake_module'}}}};\n",
  );
  if (collidingPrebuiltAddon) {
    // Two Linux ELF addons whose stripped basenames collide.
    writeElf(
      path.join(projectRoot, 'node_modules/fake-module/prebuilds/a/addon.node'),
      0x3e,
    );
    writeElf(
      path.join(projectRoot, 'node_modules/fake-module/prebuilds/b/addon.node'),
      0x3e,
    );
  }
  if (duplicateLibrary) {
    write(
      'node_modules/fake-module-two/package.json',
      `${JSON.stringify(
        {
          name: 'fake-module-two',
          version: '0.0.1',
          codegenConfig: {
            name: 'FakeSpec',
            type: 'modules',
            jsSrcsDir: 'src',
          },
        },
        null,
        2,
      )}\n`,
    );
    write('node_modules/fake-module-two/src/NativeFakeTwo.ts', spec);
    write(
      'node_modules/fake-module-two/react-native.config.js',
      "module.exports = {dependency: {platforms: {gpui: {cppProvider: 'create_fake_two_module'}}}};\n",
    );
  }
  const configPath = path.join(projectRoot, 'rn-config.json');
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        dependencies: {
          'fake-engine': {
            root: path.join(projectRoot, 'node_modules/fake-engine'),
            platforms: {
              gpui: {
                jsEngine: {
                  name: 'hermes',
                  register: 'rn_gpui_register_js_engine_hermes',
                },
              },
            },
          },
          'fake-module': {
            root: path.join(projectRoot, 'node_modules/fake-module'),
            platforms: {
              gpui: { cmake: 'gpui', cppProvider: 'create_fake_module' },
            },
          },
          ...(duplicateLibrary
            ? {
                'fake-module-two': {
                  root: path.join(projectRoot, 'node_modules/fake-module-two'),
                  platforms: {
                    gpui: { cppProvider: 'create_fake_two_module' },
                  },
                },
              }
            : {}),
        },
      },
      null,
      2,
    )}\n`,
  );
  return { projectRoot, configPath };
}

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generates both spec headers for a C++ TurboModule package', () => {
  const { projectRoot, configPath } = createProject();
  autolink({ projectRoot, configFile: configPath });
  const codegenDirectory = path.join(
    projectRoot,
    'desktop/autolink/codegen/FakeSpec',
  );
  const ours = fs.readFileSync(
    path.join(codegenDirectory, 'FakeSpec.h'),
    'utf8',
  );
  const reactNative = fs.readFileSync(
    path.join(codegenDirectory, 'FakeSpecJSI.h'),
    'utf8',
  );
  expect(ours).toContain('#include <FakeSpecJSI.h>');
  expect(ours).toContain(
    'class NativeFakeSpec : public rngpui::TurboModuleBase<T>',
  );
  expect(ours).toContain('kModuleName = "Fake"');
  expect(ours).toContain('this->template valueMethod<&T::greet>("greet");');
  expect(ours).toContain(
    'this->template promiseMethod<&T::loadLater>("loadLater");',
  );
  expect(reactNative).toContain('NativeFakeCxxSpec');
  expect(reactNative).toContain('"Fake"');
  const cmake = fs.readFileSync(
    path.join(projectRoot, 'desktop/autolink/autolink.cmake'),
    'utf8',
  );
  const includeDirs = cmake
    .split('\n')
    .find(line => line.includes('RN_GPUI_APP_CPP_INCLUDE_DIRS'));
  expect(includeDirs).toContain(codegenDirectory);
});

test('throws when a C++ TurboModule package has no codegenConfig.name', () => {
  const { projectRoot, configPath } = createProject({
    withCodegenConfig: false,
  });
  expect(() => autolink({ projectRoot, configFile: configPath })).toThrow(
    'fake-module: codegenConfig.name is required for a C++ TurboModule',
  );
});

test('throws when two packages share one codegenConfig.name', () => {
  const { projectRoot, configPath } = createProject({ duplicateLibrary: true });
  expect(() => autolink({ projectRoot, configFile: configPath })).toThrow(
    'fake-module-two: codegenConfig.name FakeSpec is already used by fake-module',
  );
});

test('leaves both headers untouched when nothing changed', () => {
  const { projectRoot, configPath } = createProject();
  autolink({ projectRoot, configFile: configPath });
  const codegenDirectory = path.join(
    projectRoot,
    'desktop/autolink/codegen/FakeSpec',
  );
  const headers = ['FakeSpec.h', 'FakeSpecJSI.h'].map(name =>
    path.join(codegenDirectory, name),
  );
  const before = headers.map(header => fs.statSync(header).mtimeMs);
  autolink({ projectRoot, configFile: configPath });
  const after = headers.map(header => fs.statSync(header).mtimeMs);
  expect(after).toEqual(before);
});

/** A minimal ELF file: enough of a header for the host-architecture check. */
function writeElf(filePath, machine) {
  const header = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(header, 0);
  header[4] = 2; // 64-bit
  header[5] = 1; // little-endian
  header.writeUInt16LE(machine, 18);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, header);
}

test('detects only Linux addons built for the host architecture', () => {
  const root = fs.mkdtempSync(path.join(repoRoot, '.local/autolink-elf-'));
  temporaryRoots.push(root);
  const addon = name => path.join(root, name);
  writeElf(addon('prebuilds/linux-x64/prebuilt.node'), 0x3e);
  writeElf(addon('prebuilds/linux-arm64/prebuilt.node'), 0xb7);
  writeElf(addon('prebuilds/darwin-x64/prebuilt.node'), 0x3e);
  writeElf(addon('prebuilds/linuxmusl-x64/prebuilt.node'), 0x3e);
  writeElf(addon('prebuilds/win32-x64/prebuilt.node'), 0x3e);
  fs.writeFileSync(
    addon('prebuilds/linux-x64/not-elf.node'),
    'not an elf file',
  );

  expect(
    isHostPrebuiltNodeAddon(addon('prebuilds/linux-x64/prebuilt.node'), 'x64'),
  ).toBe(true);
  expect(
    isHostPrebuiltNodeAddon(
      addon('prebuilds/linux-arm64/prebuilt.node'),
      'x64',
    ),
  ).toBe(false);
  expect(
    isHostPrebuiltNodeAddon(addon('prebuilds/darwin-x64/prebuilt.node'), 'x64'),
  ).toBe(false);
  expect(
    isHostPrebuiltNodeAddon(
      addon('prebuilds/linuxmusl-x64/prebuilt.node'),
      'x64',
    ),
  ).toBe(false);
  expect(
    isHostPrebuiltNodeAddon(addon('prebuilds/win32-x64/prebuilt.node'), 'x64'),
  ).toBe(false);
  expect(
    isHostPrebuiltNodeAddon(addon('prebuilds/linux-x64/not-elf.node'), 'x64'),
  ).toBe(false);
  // The arm64 host accepts the arm64 build and rejects the x64 one.
  expect(
    isHostPrebuiltNodeAddon(
      addon('prebuilds/linux-arm64/prebuilt.node'),
      'arm64',
    ),
  ).toBe(true);
  expect(
    isHostPrebuiltNodeAddon(
      addon('prebuilds/linux-x64/prebuilt.node'),
      'arm64',
    ),
  ).toBe(false);
});

test('names a discovered prebuilt addon as the Babel plugin would', () => {
  const root = fs.mkdtempSync(path.join(repoRoot, '.local/autolink-name-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'node_modules/example-prebuilt');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify({ name: 'example-prebuilt', version: '0.0.1' })}\n`,
  );
  writeElf(path.join(packageRoot, 'prebuilds/linux-x64/libexample.node'), 0x3e);
  // Resolved exactly as autolink does: from the app, by walking to the package
  // root, because the package's `exports` map does not expose path-utils.
  const appRequire = createRequire(path.join(repoRoot, 'package.json'));
  const packageEntry = appRequire.resolve('react-native-node-api');
  let directory = path.dirname(packageEntry);
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (
      fs.existsSync(manifest) &&
      JSON.parse(fs.readFileSync(manifest, 'utf8')).name ===
        'react-native-node-api'
    ) {
      break;
    }
    directory = path.dirname(directory);
  }
  const { getLibraryName } = appRequire(
    path.join(directory, 'dist/node/path-utils.js'),
  );
  const modules = findPrebuiltNodeApiModules(
    packageRoot,
    { name: 'example-prebuilt' },
    'example-prebuilt',
    modulePath =>
      getLibraryName(modulePath, { pathSuffix: 'strip', packageName: 'strip' }),
  );
  expect(modules).toHaveLength(1);
  expect(modules[0].libraryName).toBe('example-prebuilt--example');
});

test('does not descend into a package node_modules', () => {
  const root = fs.mkdtempSync(path.join(repoRoot, '.local/autolink-skip-'));
  temporaryRoots.push(root);
  const packageRoot = path.join(root, 'node_modules/example-prebuilt');
  writeElf(path.join(packageRoot, 'prebuilds/linux-x64/prebuilt.node'), 0x3e);
  writeElf(
    path.join(
      packageRoot,
      'node_modules/transitive/prebuilds/linux-x64/x.node',
    ),
    0x3e,
  );
  const modules = findPrebuiltNodeApiModules(
    packageRoot,
    { name: 'example-prebuilt' },
    'example-prebuilt',
    modulePath => `name:${path.basename(modulePath, '.node')}`,
  );
  expect(modules.map(addon => addon.libraryName)).toEqual(['name:prebuilt']);
});

test('stages no Node-API directory for an app with no addons', () => {
  const { projectRoot, configPath } = createProject();
  autolink({ projectRoot, configFile: configPath });
  expect(
    fs.existsSync(path.join(projectRoot, 'desktop/autolink/node-api/linux')),
  ).toBe(false);
});

test('reports two prebuilt addons that share a library name', () => {
  const { projectRoot, configPath } = createProject({
    collidingPrebuiltAddon: true,
  });
  // Both files strip to the same basename, so `getLibraryName` gives them the
  // same name and autolink must refuse rather than stage one over the other.
  expect(() => autolink({ projectRoot, configFile: configPath })).toThrow(
    /Node-API addon name collision for fake-module--addon/u,
  );
});
