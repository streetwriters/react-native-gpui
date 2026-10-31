import { describe, expect, test } from 'vitest';
import {
  dependencyOrder,
  publishablePackages,
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

  test('a version off the react-native minor is reported', () => {
    const problems = versionProblems([
      entry('a', {
        version: '0.88.0',
        peerDependencies: { 'react-native': '0.87.x' },
      }),
    ]);
    expect(problems.join('\n')).toMatch(/does not match peer/);
  });

  test('an internal dependency on another version is reported', () => {
    const problems = versionProblems([
      entry('a', { dependencies: { b: '^0.87.0' } }),
      entry('b'),
    ]);
    expect(problems.join('\n')).toMatch(/dependencies.b is \^0.87.0/);
  });

  test('a version that is not 0.minor.patch is reported', () => {
    expect(versionProblems([entry('a', { version: '1.0.0' })])).toHaveLength(1);
  });
});
