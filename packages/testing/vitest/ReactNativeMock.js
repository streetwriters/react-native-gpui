/**
 * Stands in for the `react-native` package root in unit tests.
 *
 * React Native's own entry is Flow-typed, so vitest cannot parse it. The modules
 * in `src-gpui` import `TurboModuleRegistry` from the package root, which is the
 * convention there; without this alias any test that imports one of those
 * modules would fail to load rather than exercise the code.
 *
 * Tests install what the native side should report through
 * `globalThis.__rnGpuiTestTurboModules`, read on every call so a test can change
 * it between reads. Nothing is registered by default, which is what the real
 * registry returns before the modules are installed.
 *
 * Only `TurboModuleRegistry` is exported. Anything else a module reaches for
 * would be a silent behaviour change, so it fails loudly instead.
 */
function lookup(name) {
  return globalThis.__rnGpuiTestTurboModules?.get(name) ?? null;
}

export const TurboModuleRegistry = {
  get: name => lookup(name),
  getEnforcing: name => {
    const found = lookup(name);
    if (found == null) {
      throw new Error(`TurboModuleRegistry.getEnforcing(): ${name} not found`);
    }
    return found;
  },
};

export default new Proxy(
  {},
  {
    get(_target, property) {
      if (property === 'TurboModuleRegistry') return TurboModuleRegistry;
      if (property === '__esModule') return true;
      throw new Error(
        `the react-native mock has no export '${String(property)}'; ` +
          'add it to packages/testing/vitest/ReactNativeMock.js ' +
          'if a unit test needs it',
      );
    },
  },
);
