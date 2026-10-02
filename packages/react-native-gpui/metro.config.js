// Metro configuration for this repo (the library's own tester app).
//
// `react-native.config.js` registers the `gpui` platform with
// `npmPackageName: 'react-native-gpui'`. The React Native CLI turns that into
// two Metro defaults before this file is loaded: `'gpui'` lands in
// `resolver.platforms`, and every `react-native` import is rewritten to
// `react-native-gpui` so apps can bundle unchanged. Two corrections on top of
// those defaults are what `resolveWithGpuiPlatform` below implements:
//
//   1. `react-native-gpui`'s entry (`index.gpui.js`) re-exports the upstream
//      JavaScript surface. Without a guard, that rewrite makes the file require
//      itself, leaving `module.exports` empty at runtime (a Metro cycle). So
//      modules that live inside the package resolve `react-native` to the real
//      upstream package.
//   2. `react-native/<subpath>` imports (e.g. `react-native/setup-env`, or the
//      deep `Libraries/...` paths the CLI's bundle preamble uses) fall through
//      to the upstream package, since the gpui package only overrides the entry
//      point for now.
//
// Everything not rewritten is handed to Metro's own resolver, never back to
// this function, so there is no recursion.
const path = require("path");

const fs = require("fs");

const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const GPUI_PACKAGE_NAME = "react-native-gpui";
const GPUI_PACKAGE_DIR = path.dirname(
  require.resolve(GPUI_PACKAGE_NAME + "/package.json"),
);
const GPUI_ENTRY = path.join(GPUI_PACKAGE_DIR, "index.gpui.js");
// Absolute paths, so the rewrite the CLI installed can never send them back
// into this package (which is what would close the cycle).
const UPSTREAM_RN_ENTRY = require.resolve("react-native");
const UPSTREAM_RN_DIR = path.dirname(UPSTREAM_RN_ENTRY);
const GPUI_RN_SRC_DIR = path.join(GPUI_PACKAGE_DIR, "src-gpui");

// Platform variants gpui falls back to. A handful of React Native modules only
// ship as `Foo.ios.js` / `Foo.android.js` (there is no platform-neutral `Foo.js`
// and no `Foo.gpui.js`): `Libraries/Core/setUpReactDevTools.js` requires
// `src/private/devsupport/rndevtools/ReactDevToolsSettingsManager`, which is
// one of them, so a `--dev` bundle cannot resolve without this. macOS is
// closest to iOS, and the iOS variants of such modules are pure JavaScript
// where we need them (ReactDevToolsSettingsManager.ios.js goes through the
// generic `Settings.js`, whose `Platform.OS === 'ios'` branch is dead here
// because the gpui `Platform.OS` is `'gpui'`).
const PLATFORM_FALLBACKS = { gpui: ["ios"] };

function resolveWithPlatformFallback(context, moduleName, platform) {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    for (const fallback of PLATFORM_FALLBACKS[platform] ?? []) {
      try {
        const resolution = context.resolveRequest(
          context,
          moduleName,
          fallback,
        );
        console.log(
          `[rn-gpui] '${moduleName}' has no '${platform}' variant; using the '${fallback}' implementation`,
        );
        return resolution;
      } catch {
        // Try the next fallback; the original error is reported below.
      }
    }
    throw error;
  }
}

// `src-gpui/**` holds gpui implementations of React Native's own JavaScript
// modules, next to the upstream files they replace. Each
// `src-gpui/<relative>.gpui.js` shadows the upstream files Metro could resolve
// for `<relative>`: the platform-neutral `.js` and the `.native.js` variant,
// plus the `ios`/`android` variants, so the platform fallback above can never
// smuggle a mobile implementation past a gpui one.
//
// The table is keyed by the *resolved* upstream path, because React Native's
// internal imports are relative (`Settings.js` does
// `import Platform from '../Utilities/Platform'`) and never pass through the
// specifier-level rewrite below.
function collectSourceOverrides() {
  const overrides = new Map();

  const walk = (relativeDir) => {
    const absoluteDir = path.join(GPUI_RN_SRC_DIR, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        walk(relative);
        continue;
      }
      if (!entry.name.endsWith(".gpui.js")) {
        continue;
      }

      const upstreamBase = path.join(
        UPSTREAM_RN_DIR,
        path.dirname(relative),
        entry.name.slice(0, -".gpui.js".length),
      );
      const override = path.join(GPUI_RN_SRC_DIR, relative);
      for (const variant of [".js", ".native.js", ".ios.js", ".android.js"]) {
        if (fs.existsSync(upstreamBase + variant)) {
          overrides.set(upstreamBase + variant, override);
        }
      }
    }
  };

  if (fs.existsSync(GPUI_RN_SRC_DIR)) {
    walk(".");
  }
  return overrides;
}

const GPUI_SOURCE_OVERRIDES = collectSourceOverrides();
if (GPUI_SOURCE_OVERRIDES.size > 0) {
  const files = [...new Set(GPUI_SOURCE_OVERRIDES.values())];
  console.log(
    `[rn-gpui] ${files.length} src-gpui override(s): ${files
      .map((file) => path.relative(GPUI_PACKAGE_DIR, file))
      .join(", ")}`,
  );
}

function applySourceOverride(resolution) {
  const filePath =
    typeof resolution === "string" ? resolution : resolution?.filePath;
  if (filePath == null) {
    return resolution;
  }

  const override = GPUI_SOURCE_OVERRIDES.get(filePath);
  if (override == null) {
    return resolution;
  }

  return typeof resolution === "string"
    ? override
    : { ...resolution, filePath: override };
}

// React Native ships a set of `.js` files that exist only so deep imports with
// an explicit extension keep working; each is a self-referential re-export shim
// and nothing else:
//
//     import BaseViewConfig from './BaseViewConfig';
//     export default BaseViewConfig;
//
// The shim expects Metro to prefer a platform variant
// (`BaseViewConfig.ios.js`) over itself, which is true for `ios`/`android` but
// not for `gpui`: `./BaseViewConfig` resolves back to the shim, its default
// export is undefined, and `createViewConfig()` dies with "Cannot read property
// 'bubblingEventTypes' of undefined" — a `--dev`-only failure, because the
// production path never builds the static view config.
//
// 0.87.1 has ten such files (all carrying the "supports backwards
// compatibility of subpath (deep) imports" note): `Libraries/Alert/
// RCTAlertManager.js`, `Libraries/Components/AccessibilityInfo/
// legacySendAccessibilityEvent.js`, `Libraries/Components/DrawerAndroid/
// DrawerLayoutAndroid.js`, `Libraries/Components/ToastAndroid/ToastAndroid.js`,
// `Libraries/Image/Image.js`, `Libraries/NativeComponent/BaseViewConfig.js`,
// `Libraries/Network/RCTNetworking.js`, `Libraries/StyleSheet/
// PlatformColorValueTypes.js`, `Libraries/Utilities/BackHandler.js` and
// `Libraries/Utilities/Platform.js` (the last one is shadowed from `src-gpui`).
//
// They are recognised by shape rather than by that note, because a module that
// imports itself is not necessarily a shim: `Libraries/Settings/Settings.js`
// requires './Settings' behind a `Platform.OS === 'ios'` check and is a real
// implementation that must be left alone.
const RE_EXPORT_SHIM =
  /^import ([A-Za-z_$][\w$]*) from '\.\/([A-Za-z_$][\w$]*)'; ?export default ([A-Za-z_$][\w$]*);?$/;
const RE_EXPORT_ALL_SHIM = /^export \* from '\.\/[A-Za-z_$][\w$]*';?$/;

const shimSourceCache = new Map();

function isReExportShim(filePath) {
  let code = shimSourceCache.get(filePath);
  if (code === undefined) {
    try {
      code = fs
        .readFileSync(filePath, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      code = null;
    }
    shimSourceCache.set(filePath, code);
  }
  if (code == null) {
    return false;
  }

  const match = RE_EXPORT_SHIM.exec(code);
  return (
    (match != null && match[1] === match[2] && match[2] === match[3]) ||
    RE_EXPORT_ALL_SHIM.test(code)
  );
}

// Prefer a fallback platform's variant for such shims, which is the file the
// shim meant to load. The check only runs for React Native's own modules that
// have a variant to prefer, so it costs one `stat` per resolution and one read
// per shim-shaped file.
function preferVariantOverShim(resolution, platform) {
  const filePath =
    typeof resolution === "string" ? resolution : resolution?.filePath;
  if (filePath == null || !filePath.startsWith(UPSTREAM_RN_DIR + path.sep)) {
    return resolution;
  }

  for (const fallback of PLATFORM_FALLBACKS[platform] ?? []) {
    const variant = filePath.replace(/\.js$/, `.${fallback}.js`);
    if (!fs.existsSync(variant)) {
      continue;
    }
    if (!isReExportShim(filePath)) {
      // A real implementation that happens to have a variant of its own.
      return resolution;
    }

    console.log(
      `[rn-gpui] re-export shim ${path.basename(filePath)}; using ${path.basename(
        variant,
      )}`,
    );
    return typeof resolution === "string"
      ? variant
      : { ...resolution, filePath: variant };
  }

  return resolution;
}

// Delegates every resolution to `context.resolveRequest`, the raw Metro
// resolver. The CLI's own out-of-tree platform resolver (which rewrites
// `react-native` imports) is deliberately bypassed: this function replaces it.
function resolveModule(context, moduleName, platform) {
  // A patched RN module keeps upstream-relative imports. Resolve those from
  // its upstream location, then apply the normal GPUI override table below.
  if (
    moduleName.startsWith(".") &&
    context.originModulePath?.startsWith(GPUI_RN_SRC_DIR + path.sep)
  ) {
    context = {
      ...context,
      originModulePath: path.join(
        UPSTREAM_RN_DIR,
        path
          .relative(GPUI_RN_SRC_DIR, context.originModulePath)
          .replace(/\.gpui\.js$/, ".js"),
      ),
    };
  }
  const isGpuiEntry =
    moduleName === "react-native" || moduleName === GPUI_PACKAGE_NAME;

  if (isGpuiEntry) {
    // Inside the package itself (index.gpui.js and friends) the import means
    // the upstream package; everywhere else it means the gpui entry point.
    const origin = context.originModulePath ?? "";
    const insideGpuiPackage =
      origin === GPUI_PACKAGE_DIR ||
      origin.startsWith(GPUI_PACKAGE_DIR + path.sep);

    return resolveWithPlatformFallback(
      context,
      insideGpuiPackage ? UPSTREAM_RN_ENTRY : GPUI_ENTRY,
      platform,
    );
  }

  if (moduleName.startsWith(GPUI_PACKAGE_NAME + "/")) {
    if (moduleName === `${GPUI_PACKAGE_NAME}/NativeViewHost`) {
      return resolveWithPlatformFallback(
        context,
        path.join(GPUI_PACKAGE_DIR, "NativeViewHost.tsx"),
        platform,
      );
    }
    // `react-native-gpui/<subpath>` -> upstream `react-native/<subpath>`,
    // for the deep `Libraries/...` imports the CLI's bundle preamble uses,
    // and for `react-native-gpui/setup-env`.
    return resolveWithPlatformFallback(
      context,
      "react-native/" + moduleName.slice(GPUI_PACKAGE_NAME.length + 1),
      platform,
    );
  }

  return resolveWithPlatformFallback(context, moduleName, platform);
}

function resolveWithGpuiPlatform() {
  return (context, moduleName, platform) =>
    applySourceOverride(
      preferVariantOverShim(
        resolveModule(context, moduleName, platform),
        platform,
      ),
    );
}

const defaultConfig = getDefaultConfig(process.cwd());

module.exports = mergeConfig(defaultConfig, {
  // These can be symlinked workspace packages; registering their real paths
  // keeps Metro's file map aware of the platform and upstream RN sources.
  watchFolders: [GPUI_PACKAGE_DIR, UPSTREAM_RN_DIR],
  resolver: {
    // `gpui` first so `Foo.gpui.js` wins; the generic `Foo.js` (rather than the
    // `ios`/`android` variants) is the fallback, which is what a desktop
    // platform wants.
    platforms: ["gpui", "native"],
    nodeModulesPaths: [
      path.join(process.cwd(), "node_modules"),
      path.join(__dirname, "node_modules"),
    ],
    resolveRequest: resolveWithGpuiPlatform(defaultConfig),
  },
});
