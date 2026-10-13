import { afterEach, beforeEach, describe, expect, test } from 'vitest';

/**
 * `Platform.hostOS` and `Platform.constants.systemName` have to answer for the
 * host the bundle is running on, and they have to answer on the *first* read:
 * a bundle whose first line asks for the host cannot be told the wrong one.
 *
 * The module under test imports `TurboModuleRegistry` from the `react-native`
 * package root, which the vitest preset aliases to a mock — React Native's own
 * entry is Flow-typed and cannot be parsed here. What the native side reports is
 * installed through `globalThis.__rnGpuiTestTurboModules`, which that mock reads
 * on every call.
 */
const registry = new Map();

function desktopReporting(platform) {
  registry.set('GpuiDesktop', { platform: () => platform });
}

function platformConstantsReporting(jsEngine) {
  registry.set('PlatformConstants', {
    getConstants: () => ({ jsEngine }),
  });
}

/**
 * The module under test is a singleton with two cache fields (`__hostOS`,
 * `__constants`). Every test wants it as a bundle would see it on first use, so
 * those fields are cleared rather than the module re-imported — re-importing
 * would need `vi.resetModules()`, which also clears the alias.
 */
let platform;

beforeEach(async () => {
  registry.clear();
  globalThis.__rnGpuiTestTurboModules = registry;
  platform ??= (await import('./Platform.gpui.js')).default;
  platform.__hostOS = null;
  platform.__constants = null;
});

afterEach(() => {
  registry.clear();
  delete globalThis.__rnGpuiTestTurboModules;
});

describe('Platform.hostOS', () => {
  test('answers on the first read, before anything reads constants', () => {
    desktopReporting('windows');
    // Deliberately no `Platform.constants` read first: this is the case that
    // reported macOS on every host.
    expect(platform.hostOS).toBe('windows');
  });

  test('reports each host the native module can name', () => {
    for (const hostOS of ['macos', 'windows', 'linux']) {
      registry.clear();
      desktopReporting(hostOS);
      platform.__hostOS = null;
      expect(platform.hostOS).toBe(hostOS);
    }
  });

  test('retries a failed lookup on the next read instead of caching the miss', () => {
    // Nothing installed yet: the documented fallback, not a cached answer.
    expect(platform.hostOS).toBe('macos');

    desktopReporting('windows');
    expect(platform.hostOS).toBe('windows');
  });

  test('keeps the first real answer it gets', () => {
    desktopReporting('linux');
    expect(platform.hostOS).toBe('linux');

    // A host cannot change under a running bundle, and a later transient failure
    // must not overwrite what was already reported.
    registry.clear();
    expect(platform.hostOS).toBe('linux');
  });

  test('agrees with constants when constants is read first', () => {
    desktopReporting('linux');
    platformConstantsReporting({ name: 'hermes', version: '1' });

    expect(platform.constants.systemName).toBe('Linux');
    expect(platform.hostOS).toBe('linux');
  });
});

describe('Platform.constants.systemName', () => {
  test('names the real host rather than always macOS', () => {
    for (const [hostOS, expected] of [
      ['macos', 'macOS'],
      ['windows', 'Windows'],
      ['linux', 'Linux'],
    ]) {
      registry.clear();
      desktopReporting(hostOS);
      platform.__hostOS = null;
      platform.__constants = null;
      expect(platform.constants.systemName).toBe(expected);
    }
  });

  test('is still macOS-shaped when the module cannot answer', () => {
    // The fallback keeps the value a documented spelling, so a caller that
    // switches on it cannot receive an unknown string.
    expect(platform.constants.systemName).toBe('macOS');
  });
});
