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

// `Platform.hostOS` is the operating system the GPUI runtime is running on, one
// of `macos`, `windows` or `linux`. It cannot be a literal: the same bundle
// loads on all three. The desktop-shell TurboModule reports it (`platform()`),
// which reads `std::env::consts::OS` natively. `Platform.OS` stays `'gpui'` on
// every host, so a caller that needs the host uses this.
function readHostOS() {
  try {
    const NativeGpuiDesktop = require('../TurboModule/TurboModuleRegistry').get(
      'GpuiDesktop',
    );
    const reported = NativeGpuiDesktop?.platform?.();
    if (typeof reported === 'string' && reported.length > 0) {
      return reported;
    }
  } catch {
    // TurboModules are not installed yet; the caller retries on the next read.
  }
  return null;
}

const Platform = {
  __constants: null,
  OS: 'gpui',
  get hostOS() {
    return this.__hostOS ?? 'macos';
  },
  __hostOS: null,

  get Version() {
    return this.constants.osVersion;
  },

  get constants() {
    if (this.__constants == null) {
      const jsEngine = readJsEngine();
      const hostOS = readHostOS();
      if (hostOS != null) this.__hostOS = hostOS;
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
