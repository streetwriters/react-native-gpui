import { describe, expect, test } from 'vitest';
import {
  dependencyOrder,
  metadataProblems,
  publishablePackages,
  publishOrder,
  tarballProblems,
  versionProblems,
} from './publish-npm.mjs';

const entry = (name, extra = {}) => ({
  dir: `/x/${name}`,
  manifest: { name, version: '0.87.0-alpha.0', ...extra },
});

describe('publish order', () => {
  test('dependencies come before their dependents', () => {
    const order = dependencyOrder([
      entry('cli'),
      entry('reanimated', { peerDependencies: { worklets: '0.87.0-alpha.0' } }),
      entry('worklets'),
      entry('core', { dependencies: { codegen: '0.87.0-alpha.0' } }),
      entry('codegen'),
    ]).map(item => item.manifest.name);
    expect(order.indexOf('codegen')).toBeLessThan(order.indexOf('core'));
    expect(order.indexOf('worklets')).toBeLessThan(order.indexOf('reanimated'));
  });

  test('the repository publishes codegen before core and core before cli users', () => {
    const order = dependencyOrder(publishablePackages()).map(
      item => item.manifest.name,
    );
    expect(order.indexOf('@react-native-gpui/codegen')).toBeLessThan(
      order.indexOf('@react-native-gpui/core'),
    );
    expect(order.length).toBeGreaterThanOrEqual(14);
  });
});

describe('version rules', () => {
  test('the repository follows them', () => {
    expect(versionProblems(publishablePackages())).toEqual([]);
  });

  test('a package that follows React Native must match its peer', () => {
    const problems = versionProblems([
      entry('@react-native-gpui/core', {
        version: '0.88.0',
        peerDependencies: { 'react-native': '0.87.x' },
      }),
    ]);
    expect(problems.join('\n')).toMatch(/does not match peer/);
  });

  test('an adapter takes the version of the library it adapts', () => {
    const ok = entry('@react-native-gpui/screens', {
      version: '4.28.0-alpha.0',
      peerDependencies: { 'react-native-screens': '4.28.x' },
    });
    expect(versionProblems([ok])).toEqual([]);
    const wrong = entry('@react-native-gpui/screens', {
      version: '0.87.0-alpha.0',
      peerDependencies: { 'react-native-screens': '4.28.x' },
    });
    expect(versionProblems([wrong]).join('\n')).toMatch(/does not match peer/);
  });

  test('a standalone module is 0.0.x', () => {
    expect(
      versionProblems([
        entry('@react-native-gpui/fonts', { version: '0.0.1-alpha.0' }),
      ]),
    ).toEqual([]);
    expect(
      versionProblems([
        entry('@react-native-gpui/fonts', { version: '0.87.0' }),
      ]),
    ).toHaveLength(1);
  });

  test("a dependency on our own package is that package's version", () => {
    const problems = versionProblems([
      entry('@react-native-gpui/worklets', {
        version: '0.13.0-alpha.0',
        peerDependencies: { 'react-native-worklets': '0.13.x' },
      }),
      entry('@react-native-gpui/reanimated', {
        version: '4.7.0-alpha.0',
        peerDependencies: {
          'react-native-reanimated': '4.7.x',
          '@react-native-gpui/worklets': '0.87.0-alpha.0',
        },
      }),
    ]);
    expect(problems.join('\n')).toMatch(
      /peerDependencies.@react-native-gpui\/worklets is 0.87.0-alpha.0, expected 0.13.0-alpha.0/,
    );
  });
});

describe('publish order of the repository', () => {
  test('every module comes before every package', () => {
    const order = publishOrder(publishablePackages()).map(
      item => item.manifest.name,
    );
    expect(
      order
        .slice(0, 9)
        .every(name => !/\/(cli|codegen|core|hermes|testing)$/u.test(name)),
    ).toBe(true);
    expect(order.indexOf('@react-native-gpui/worklets')).toBeLessThan(
      order.indexOf('@react-native-gpui/reanimated'),
    );
    expect(order.indexOf('@react-native-gpui/codegen')).toBeLessThan(
      order.indexOf('@react-native-gpui/core'),
    );
  });
});

describe('metadata', () => {
  test('the repository has what npm needs', () => {
    expect(metadataProblems(publishablePackages())).toEqual([]);
  });

  test('a package without a license or the latest tag is reported', () => {
    const problems = metadataProblems([
      entry('@react-native-gpui/x', {
        description: 'x',
        repository: { url: 'git+https://example.com/x.git' },
        publishConfig: { access: 'public', tag: 'alpha' },
      }),
    ]);
    expect(problems).toEqual([
      '@react-native-gpui/x: no license',
      '@react-native-gpui/x: publishConfig.tag is not latest',
    ]);
  });
});

describe('tarball contents', () => {
  const manifest = { name: '@react-native-gpui/x' };

  test('a module ships the native project autolinking points at', () => {
    expect(
      tarballProblems(
        manifest,
        [
          'LICENSE',
          'src/index.ts',
          'desktop/CMakeLists.txt',
          'desktop/Cargo.toml',
        ],
        { cmake: 'desktop', crate: 'rn-gpui-x' },
      ),
    ).toEqual([]);
    expect(
      tarballProblems(manifest, ['LICENSE', 'src/index.ts'], {
        cmake: 'desktop',
      }),
    ).toEqual([
      '@react-native-gpui/x: the tarball has no desktop/CMakeLists.txt for autolinking',
    ]);
  });

  test('a tarball needs a license and no tests', () => {
    expect(tarballProblems(manifest, ['src/a.test.ts'], undefined)).toEqual([
      '@react-native-gpui/x: the tarball has no LICENSE',
      '@react-native-gpui/x: the tarball includes the test src/a.test.ts',
    ]);
  });
});
