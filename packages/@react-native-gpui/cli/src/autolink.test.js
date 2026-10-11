import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import { autolink } from './autolink.js';

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
  // The generated CMake normalises every path to `/`, which is what CMake
  // accepts on every platform (a Windows `\` is an escape in a CMake string).
  expect(includeDirs).toContain(codegenDirectory.replaceAll('\\', '/'));
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
