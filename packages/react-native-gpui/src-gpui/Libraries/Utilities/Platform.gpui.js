// The registry comes from the package root, as it does in the other modules in
// this tree (`BackHandler.gpui.js`, `TextInput.gpui.js`). A relative path would
// also work in a bundle — Metro rebases a patched module's imports onto its
// upstream location — but only there, which makes this file's own logic
// untestable outside a running app.
import { TurboModuleRegistry } from 'react-native';

function readJsEngine() {
  try {
    const constants =
      TurboModuleRegistry.get('PlatformConstants')?.getConstants?.();
    const jsEngine = constants?.jsEngine;
    if (jsEngine && typeof jsEngine.name === 'string') {
      return jsEngine;
    }
  } catch {
    // TurboModules are not installed yet; the caller retries on the next read.
  }
  return null;
}

// Native reports no `systemName`, so it comes from here, and it must not claim
// macOS on a Windows or Linux host: an app that branches on it would take the
// wrong path. The value is derived from the host when it is known, and the
// documented React Native spelling (`macOS`, `Windows`, `Linux`) otherwise.
const HOST_SYSTEM_NAMES = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

const staticConstants = {
  forceTouchAvailable: false,
  interfaceIdiom: 'desktop',
  isTesting: false,
  isDisableAnimations: false,
  // The runtime reports no osVersion yet, so these are placeholders that keep
  // `Platform.Version` string-typed for version-gated callers.
  osVersion: 'unknown',
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
    const NativeGpuiDesktop = TurboModuleRegistry.get('GpuiDesktop');
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
    // Resolve on the first read rather than waiting for `constants`: a bundle
    // that asks for the host before anything reads `constants` would otherwise
    // get the fallback, which is the wrong answer on two hosts out of three.
    if (this.__hostOS == null) {
      const reported = readHostOS();
      // Cache a real answer; a failed lookup is retried on the next read, since
      // TurboModules may not be installed yet.
      if (reported != null) this.__hostOS = reported;
    }
    // Only when the module cannot answer at all. Reported as-is rather than
    // guessed, so a caller can tell "not available yet" from a real host.
    return this.__hostOS ?? 'macos';
  },
  __hostOS: null,

  get Version() {
    return this.constants.osVersion;
  },

  get constants() {
    if (this.__constants == null) {
      const jsEngine = readJsEngine();
      const hostOS = this.hostOS;
      if (jsEngine == null) {
        // Do not cache: a later read succeeds once TurboModules are installed.
        return {
          ...staticConstants,
          jsEngine: { name: 'unknown', version: '' },
          systemName: HOST_SYSTEM_NAMES[hostOS] ?? 'macOS',
        };
      }
      this.__constants = {
        ...staticConstants,
        jsEngine,
        systemName: HOST_SYSTEM_NAMES[hostOS] ?? 'macOS',
      };
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
