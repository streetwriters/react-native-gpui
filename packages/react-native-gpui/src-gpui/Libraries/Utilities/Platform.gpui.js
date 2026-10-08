/**
 * gpui platform implementation of React Native's `Platform` module.
 *
 * Derived from `Libraries/Utilities/Platform.ios.js` with the native-module
 * lookups replaced by statically known values: a gpui host is a desktop window.
 * The one value that is not static is `jsEngine`, which comes from the active
 * JS engine package through the core `PlatformConstants` TurboModule.
 *
 * This file shadows the upstream `Libraries/Utilities/Platform.js` through the
 * `src-gpui/**` override table in `metro.config.js`, and is registered as a
 * `platform` override in `overrides.json`. Without it the upstream file is a
 * self-referential re-export shim (`import Platform from './Platform'`) that
 * only works when a platform-specific `Platform.<platform>.js` outranks it.
 */

/**
 * `Platform.constants.jsEngine` for the engine package that is running, e.g.
 * `{ name: 'hermes', version: '10a40b5' }`. Returns null when the TurboModule is
 * not reachable yet, so the caller can avoid caching a placeholder.
 *
 * The registry is required lazily: `Platform` is imported very early in app
 * startup, before the TurboModule registry is usable, and requiring it here
 * keeps it out of the module graph for code that never reads the constants.
 */
function readJsEngine() {
  try {
    const { get } = require('../TurboModule/TurboModuleRegistry');
    const constants = get('PlatformConstants')?.getConstants?.();
    const jsEngine = constants?.jsEngine;
    if (jsEngine && typeof jsEngine.name === 'string') {
      return jsEngine;
    }
  } catch {
    // TurboModules are not installed yet; the caller retries on the next read.
  }
  return null;
}

// Everything except `jsEngine` is statically known for the desktop platform.
const staticConstants = {
  forceTouchAvailable: false,
  interfaceIdiom: 'desktop',
  isTesting: false,
  isDisableAnimations: false,
  // The runtime reports no osVersion yet, so these are placeholders that keep
  // `Platform.Version` string-typed for version-gated callers.
  osVersion: 'unknown',
  systemName: 'macOS',
  reactNativeVersion: {
    major: 0,
    minor: 87,
    patch: 1,
    prerelease: null,
  },
};

const Platform = {
  __constants: null,
  OS: 'gpui',
  // Desktop host this build targets. macOS first (see the phase plan); the
  // Windows and Linux ports change this along with the renderer.
  hostOS: 'macos',

  get Version() {
    return this.constants.osVersion;
  },

  get constants() {
    if (this.__constants == null) {
      const jsEngine = readJsEngine();
      if (jsEngine == null) {
        // Do not cache: a later read succeeds once TurboModules are installed.
        return {
          ...staticConstants,
          jsEngine: { name: 'unknown', version: '' },
        };
      }
      this.__constants = { ...staticConstants, jsEngine };
    }
    return this.__constants;
  },

  get isPad() {
    return false;
  },

  get isTV() {
    return false;
  },

  get isVision() {
    return false;
  },

  get isTesting() {
    return this.constants.isTesting;
  },

  get isDisableAnimations() {
    return this.constants.isDisableAnimations ?? this.isTesting;
  },

  get isMacCatalyst() {
    return false;
  },

  // `spec.gpui` wins, then the platform-neutral `spec.native`, then `default`.
  select: spec =>
    'gpui' in spec ? spec.gpui : 'native' in spec ? spec.native : spec.default,
};

export default Platform;
