/**
 * gpui platform implementation of React Native's `Platform` module.
 *
 * Derived from `Libraries/Utilities/Platform.ios.js` with the native-module
 * lookups replaced by statically known values: a gpui host is a desktop window,
 * and the runtime does not expose a `PlatformConstants` TurboModule yet
 * (TODO 3.10 wires the real values through from the Rust side).
 *
 * This file shadows the upstream `Libraries/Utilities/Platform.js` through the
 * `src-gpui/**` override table in `metro.config.js`, and is registered as a
 * `platform` override in `overrides.json`. Without it the upstream file is a
 * self-referential re-export shim (`import Platform from './Platform'`) that
 * only works when a platform-specific `Platform.<platform>.js` outranks it.
 */

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
      this.__constants = {
        forceTouchAvailable: false,
        interfaceIdiom: 'desktop',
        isTesting: false,
        isDisableAnimations: false,
        // The runtime reports no constants yet, so these are placeholders that
        // keep `Platform.Version` string-typed for version-gated callers.
        osVersion: 'unknown',
        systemName: 'macOS',
        reactNativeVersion: {
          major: 0,
          minor: 87,
          patch: 1,
          prerelease: null,
        },
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
