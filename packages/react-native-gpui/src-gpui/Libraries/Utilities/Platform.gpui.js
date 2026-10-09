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
