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
const path = require('path');

const fs = require('fs');
const { createRequire } = require('module');

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const { activeJsEngineBundle } = require('./js-engine');

const GPUI_PACKAGE_NAME = 'react-native-gpui';
const GPUI_PACKAGE_DIR = path.dirname(
  require.resolve(GPUI_PACKAGE_NAME + '/package.json'),
);
const GPUI_ENTRY = path.join(GPUI_PACKAGE_DIR, 'index.gpui.js');
// Absolute paths, so the rewrite the CLI installed can never send them back
// into this package (which is what would close the cycle).
const UPSTREAM_RN_ENTRY = require.resolve('react-native');
const UPSTREAM_RN_DIR = path.dirname(UPSTREAM_RN_ENTRY);
const UPSTREAM_RN_DIRS = new Set([UPSTREAM_RN_DIR]);
let activeUpstreamRNEntry = UPSTREAM_RN_ENTRY;
let activeUpstreamRNDir = UPSTREAM_RN_DIR;
const GPUI_RN_SRC_DIR = path.join(GPUI_PACKAGE_DIR, 'src-gpui');

// Platform variants gpui falls back to. A handful of React Native modules only
// ship as `Foo.ios.js` / `Foo.android.js` (there is no platform-neutral `Foo.js`
// and no `Foo.gpui.js`): `Libraries/Core/setUpReactDevTools.js` requires
// `src/private/devsupport/rndevtools/ReactDevToolsSettingsManager`, which is
// one of them, so a `--dev` bundle cannot resolve without this. macOS is
// closest to iOS, and the iOS variants of such modules are pure JavaScript
// where we need them (ReactDevToolsSettingsManager.ios.js goes through the
// generic `Settings.js`, whose `Platform.OS === 'ios'` branch is dead here
// because the gpui `Platform.OS` is `'gpui'`).
const PLATFORM_FALLBACKS = { gpui: ['ios'] };

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
function collectSourceOverrides(upstreamRNDir = UPSTREAM_RN_DIR) {
  const overrides = new Map();

  const walk = relativeDir => {
    const absoluteDir = path.join(GPUI_RN_SRC_DIR, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        walk(relative);
        continue;
      }
      if (!/\.gpui\.(?:js|ts|tsx)$/.test(entry.name)) {
        continue;
      }

      const upstreamBase = path.join(
        upstreamRNDir,
        path.dirname(relative),
        entry.name.replace(/\.gpui\.(?:js|ts|tsx)$/, ''),
      );
      const override = path.join(GPUI_RN_SRC_DIR, relative);
      for (const variant of ['.js', '.native.js', '.ios.js', '.android.js']) {
        if (fs.existsSync(upstreamBase + variant)) {
          overrides.set(upstreamBase + variant, override);
        }
      }
    }
  };

  if (fs.existsSync(GPUI_RN_SRC_DIR)) {
    walk('.');
  }
  return overrides;
}

const GPUI_SOURCE_OVERRIDES = collectSourceOverrides();
// The files that actually shadow an upstream React Native module. Only those
// keep upstream-relative imports; a new module that merely lives under
// `src-gpui` (the desktop-shell implementation, for example) resolves its own
// relative imports normally.
const GPUI_OVERRIDE_FILES = new Set(GPUI_SOURCE_OVERRIDES.values());
// RNGH's legacy handler path registers only the continuous event in its JS
// module. GPUI dispatches the codegen state-change event directly, so expose
// the same direct-event registrations from a GPUI-specific source shim.
try {
  const gestureHandlerDir = path.dirname(
    require.resolve('react-native-gesture-handler/package.json'),
  );
  const gestureHandlerEvents = path.join(
    gestureHandlerDir,
    'src/handlers/customDirectEventTypes.ts',
  );
  const gpuiGestureHandlerEvents = path.join(
    path.dirname(
      require.resolve('@react-native-gpui/gesture-handler/package.json'),
    ),
    'src/customDirectEventTypes.gpui.ts',
  );
  if (fs.existsSync(gpuiGestureHandlerEvents)) {
    GPUI_SOURCE_OVERRIDES.set(gestureHandlerEvents, gpuiGestureHandlerEvents);
  }
  const upstreamGestureButtons = path.join(
    gestureHandlerDir,
    'src/v3/components/GestureButtons.tsx',
  );
  const gpuiGestureButtons = path.join(
    path.dirname(
      require.resolve('@react-native-gpui/gesture-handler/package.json'),
    ),
    'src/GestureButtons.gpui.tsx',
  );
  if (fs.existsSync(gpuiGestureButtons)) {
    GPUI_SOURCE_OVERRIDES.set(upstreamGestureButtons, gpuiGestureButtons);
  }
} catch {
  // Gesture Handler is an optional platform package.
}
try {
  const screensDir = path.dirname(
    require.resolve('react-native-screens/package.json'),
  );
  const gpuiScreensCore = path.join(
    path.dirname(require.resolve('@react-native-gpui/screens/package.json')),
    'src/core.gpui.ts',
  );
  const gpuiFullWindowOverlay = path.join(
    path.dirname(require.resolve('@react-native-gpui/screens/package.json')),
    'src/FullWindowOverlay.gpui.tsx',
  );
  GPUI_SOURCE_OVERRIDES.set(
    path.join(screensDir, 'src/core.ts'),
    gpuiScreensCore,
  );
  GPUI_SOURCE_OVERRIDES.set(
    path.join(screensDir, 'src/components/FullWindowOverlay.tsx'),
    gpuiFullWindowOverlay,
  );
} catch {
  // Screens is optional for apps that do not use native-stack.
}
if (GPUI_SOURCE_OVERRIDES.size > 0) {
  const files = [...new Set(GPUI_SOURCE_OVERRIDES.values())];
  console.log(
    `[rn-gpui] ${files.length} src-gpui override(s): ${files
      .map(file => path.relative(GPUI_PACKAGE_DIR, file))
      .join(', ')}`,
  );
}

/** Whether `filePath` is a `src-gpui` file that shadows an upstream RN module. */
function isGpuiOverrideFile(filePath) {
  if (GPUI_OVERRIDE_FILES.has(filePath)) {
    return true;
  }
  try {
    const canonical = fs.realpathSync(filePath);
    for (const override of GPUI_OVERRIDE_FILES) {
      try {
        if (fs.realpathSync(override) === canonical) {
          return true;
        }
      } catch {
        // The override moved; ignore it.
      }
    }
  } catch {
    // The file disappeared; treat it as a normal module.
  }
  return false;
}

function applySourceOverride(resolution) {
  const filePath =
    typeof resolution === 'string' ? resolution : resolution?.filePath;
  if (filePath == null) {
    return resolution;
  }

  let override = GPUI_SOURCE_OVERRIDES.get(filePath);
  if (override == null) {
    // Metro can return a canonical or workspace-local React Native path that
    // differs from the path used by Node's resolver when the app has its own
    // nested node_modules tree. Match the path relative to the RN package so
    // GPUI source replacements still apply to every resolved RN copy.
    const reactNativeMarker = `${path.sep}react-native${path.sep}`;
    const markerIndex = filePath.lastIndexOf(reactNativeMarker);
    if (markerIndex !== -1) {
      const suffix = filePath.slice(markerIndex + reactNativeMarker.length);
      for (const [sourcePath, candidate] of GPUI_SOURCE_OVERRIDES) {
        if (sourcePath.endsWith(`${path.sep}${suffix}`)) {
          override = candidate;
          break;
        }
      }
    }
  }
  if (
    override == null &&
    filePath.endsWith(
      `${path.sep}react-native-screens${path.sep}src${path.sep}core.ts`,
    )
  ) {
    for (const [sourcePath, candidate] of GPUI_SOURCE_OVERRIDES) {
      if (
        sourcePath.endsWith(
          `${path.sep}react-native-screens${path.sep}src${path.sep}core.ts`,
        )
      ) {
        override = candidate;
        break;
      }
    }
  }
  if (override == null) {
    // Metro may resolve a symlinked workspace package through its canonical
    // path, while `require.resolve` above returned the node_modules path.
    // Compare real paths so platform-package overrides also apply in that
    // workspace layout.
    let canonicalPath;
    try {
      canonicalPath = fs.realpathSync(filePath);
      for (const [sourcePath, candidate] of GPUI_SOURCE_OVERRIDES) {
        if (fs.realpathSync(sourcePath) === canonicalPath) {
          override = candidate;
          break;
        }
      }
    } catch {
      // Keep normal Metro resolution when either path has disappeared.
    }
  }
  if (override == null) {
    return resolution;
  }

  return typeof resolution === 'string'
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
        .readFileSync(filePath, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, ' ')
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
    typeof resolution === 'string' ? resolution : resolution?.filePath;
  if (
    filePath == null ||
    ![...UPSTREAM_RN_DIRS].some(directory =>
      filePath.startsWith(directory + path.sep),
    )
  ) {
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
    return typeof resolution === 'string'
      ? variant
      : { ...resolution, filePath: variant };
  }

  return resolution;
}

// Delegates every resolution to `context.resolveRequest`, the raw Metro
// resolver. The CLI's own out-of-tree platform resolver (which rewrites
// `react-native` imports) is deliberately bypassed: this function replaces it.
function resolveModule(context, moduleName, platform) {
  if (moduleName === 'react-native/setup-env') {
    const origin = context.originModulePath ?? '';
    const gpuiSetupEnv = path.join(GPUI_PACKAGE_DIR, 'setup-env.js');
    const setupEnv =
      origin === gpuiSetupEnv
        ? path.join(activeUpstreamRNDir, 'src/setup-env.js')
        : gpuiSetupEnv;
    return resolveWithPlatformFallback(context, setupEnv, platform);
  }

  // InitializeCore pulls setup-env into the graph with a relative import.
  // Route it through the GPUI setup-env too: Metro only runs the
  // run-before-main modules that are already in the graph, so otherwise the
  // `window` alias never runs.
  if (
    moduleName === '../../src/setup-env' &&
    /[\\/]Libraries[\\/]Core[\\/]InitializeCore\.js$/.test(
      context.originModulePath ?? '',
    )
  ) {
    return resolveWithPlatformFallback(
      context,
      path.join(GPUI_PACKAGE_DIR, 'setup-env.js'),
      platform,
    );
  }

  // A patched RN module keeps upstream-relative imports. Resolve those from
  // its upstream location, then apply the normal GPUI override table below.
  // Only real overrides do this: `src-gpui` also holds new modules that do not
  // mirror an upstream file, and re-basing those would break their own relative
  // imports (their sibling files do not exist under React Native).
  if (
    moduleName.startsWith('.') &&
    context.originModulePath?.startsWith(GPUI_RN_SRC_DIR + path.sep) &&
    isGpuiOverrideFile(context.originModulePath)
  ) {
    context = {
      ...context,
      originModulePath: path.join(
        activeUpstreamRNDir,
        path
          .relative(GPUI_RN_SRC_DIR, context.originModulePath)
          .replace(/\.gpui\.(?:js|ts|tsx)$/, '.js'),
      ),
    };
  }
  const isGpuiEntry =
    moduleName === 'react-native' || moduleName === GPUI_PACKAGE_NAME;

  if (isGpuiEntry) {
    // Inside the package itself (index.gpui.js and friends) the import means
    // the upstream package; everywhere else it means the gpui entry point.
    const origin = context.originModulePath ?? '';
    const insideGpuiPackage =
      origin === GPUI_PACKAGE_DIR ||
      origin.startsWith(GPUI_PACKAGE_DIR + path.sep);

    return resolveWithPlatformFallback(
      context,
      insideGpuiPackage ? activeUpstreamRNEntry : GPUI_ENTRY,
      platform,
    );
  }

  if (moduleName.startsWith(GPUI_PACKAGE_NAME + '/')) {
    if (moduleName === `${GPUI_PACKAGE_NAME}/navigation`) {
      return resolveWithPlatformFallback(
        context,
        path.join(GPUI_PACKAGE_DIR, 'navigation.ts'),
        platform,
      );
    }
    if (moduleName === `${GPUI_PACKAGE_NAME}/NativeViewHost`) {
      return resolveWithPlatformFallback(
        context,
        path.join(GPUI_PACKAGE_DIR, 'NativeViewHost.tsx'),
        platform,
      );
    }
    // `react-native-gpui/desktop` is a public entry point (plan 7.1–7.6), not
    // an upstream subpath, so it must be mapped here or the catch-all below
    // would rewrite it to `react-native/desktop`.
    if (moduleName === `${GPUI_PACKAGE_NAME}/desktop`) {
      return resolveWithPlatformFallback(
        context,
        path.join(GPUI_PACKAGE_DIR, 'desktop.ts'),
        platform,
      );
    }
    if (moduleName === `${GPUI_PACKAGE_NAME}/polyfills/menu`) {
      return resolveWithPlatformFallback(
        context,
        path.join(GPUI_PACKAGE_DIR, 'polyfills/menu.tsx'),
        platform,
      );
    }
    // `react-native-gpui/<subpath>` -> upstream `react-native/<subpath>`,
    // for the deep `Libraries/...` imports the CLI's bundle preamble uses,
    // and for `react-native-gpui/setup-env`.
    return resolveWithPlatformFallback(
      context,
      'react-native/' + moduleName.slice(GPUI_PACKAGE_NAME.length + 1),
      platform,
    );
  }

  return resolveWithPlatformFallback(context, moduleName, platform);
}

function resolveWithGpuiPlatform() {
  return (context, moduleName, platform) => {
    // Platform adapters can reuse an explicit upstream implementation without
    // routing that implementation back through the adapter itself.
    if (
      context.originModulePath?.startsWith(GPUI_RN_SRC_DIR + path.sep) &&
      /\.(?:ios|android)(?:\.js)?$/.test(moduleName)
    ) {
      return resolveModule(context, moduleName, platform);
    }
    return applySourceOverride(
      preferVariantOverShim(
        resolveModule(context, moduleName, platform),
        platform,
      ),
    );
  };
}

function makeMetroConfig({ projectRoot = process.cwd() } = {}) {
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  activeUpstreamRNEntry = appRequire.resolve('react-native');
  activeUpstreamRNDir = path.dirname(activeUpstreamRNEntry);
  UPSTREAM_RN_DIRS.add(activeUpstreamRNDir);
  for (const [source, override] of collectSourceOverrides(
    activeUpstreamRNDir,
  )) {
    GPUI_SOURCE_OVERRIDES.set(source, override);
    GPUI_OVERRIDE_FILES.add(override);
  }
  const defaultConfig = getDefaultConfig(projectRoot);
  const projectGestureHandlerDir = path.join(
    projectRoot,
    'node_modules/react-native-gesture-handler',
  );
  const gpuiGestureHandlerDir = path.dirname(
    require.resolve('@react-native-gpui/gesture-handler/package.json'),
  );
  const projectGestureEvents = path.join(
    projectGestureHandlerDir,
    'src/handlers/customDirectEventTypes.ts',
  );
  const projectGestureButtons = path.join(
    projectGestureHandlerDir,
    'src/v3/components/GestureButtons.tsx',
  );
  if (fs.existsSync(projectGestureHandlerDir)) {
    GPUI_SOURCE_OVERRIDES.set(
      projectGestureEvents,
      path.join(gpuiGestureHandlerDir, 'src/customDirectEventTypes.gpui.ts'),
    );
    GPUI_SOURCE_OVERRIDES.set(
      projectGestureButtons,
      path.join(gpuiGestureHandlerDir, 'src/GestureButtons.gpui.tsx'),
    );
  }
  const projectScreensDir = path.join(
    projectRoot,
    'node_modules/react-native-screens',
  );
  if (fs.existsSync(projectScreensDir)) {
    GPUI_SOURCE_OVERRIDES.set(
      path.join(projectScreensDir, 'src/core.ts'),
      path.join(
        path.dirname(
          require.resolve('@react-native-gpui/screens/package.json'),
        ),
        'src/core.gpui.ts',
      ),
    );
    GPUI_SOURCE_OVERRIDES.set(
      path.join(projectScreensDir, 'src/components/FullWindowOverlay.tsx'),
      path.join(
        path.dirname(
          require.resolve('@react-native-gpui/screens/package.json'),
        ),
        'src/FullWindowOverlay.gpui.tsx',
      ),
    );
  }
  const drawerGestureHandler = path.join(
    projectRoot,
    'node_modules/react-native-drawer-layout/lib/module/views/GestureHandler.js',
  );
  const drawerNativeGestureHandler = path.join(
    projectRoot,
    'node_modules/react-native-drawer-layout/lib/module/views/GestureHandler.ios.js',
  );
  if (fs.existsSync(drawerNativeGestureHandler)) {
    // The package's platform-neutral GestureHandler is a web-only no-op stub.
    // GPUI follows its native implementation, which attaches the drawer Pan.
    GPUI_SOURCE_OVERRIDES.set(drawerGestureHandler, drawerNativeGestureHandler);
  }
  const nodeModulesPaths = [];
  const platformPackageDirs = [];
  const appPackage = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  try {
    platformPackageDirs.push(
      path.dirname(
        require.resolve('@react-native-gpui/gesture-handler/package.json'),
      ),
    );
  } catch {
    // Gesture Handler is optional for apps that only use the core GPUI package.
  }
  try {
    platformPackageDirs.push(
      path.dirname(require.resolve('@react-native-gpui/screens/package.json')),
    );
  } catch {
    // Screens is optional for apps that do not use native-stack.
  }
  const gpuiPackages = new Set([
    ...Object.keys(appPackage.dependencies ?? {}),
    ...Object.keys(appPackage.devDependencies ?? {}),
  ]);
  for (const packageName of gpuiPackages) {
    if (!packageName.startsWith('@react-native-gpui/')) continue;
    try {
      platformPackageDirs.push(
        path.dirname(appRequire.resolve(`${packageName}/package.json`)),
      );
    } catch {
      // Optional GPUI packages contribute Metro sources only when installed.
    }
  }
  for (let directory = projectRoot; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules');
    if (fs.existsSync(candidate)) nodeModulesPaths.push(candidate);
    if (path.dirname(directory) === directory) break;
  }
  const linkedPackageDirs = [];
  for (const packageName of gpuiPackages) {
    for (const modulesPath of nodeModulesPaths) {
      const candidate = path.join(modulesPath, packageName);
      if (!fs.existsSync(candidate)) continue;
      const realPath = fs.realpathSync(candidate);
      if (
        !realPath.startsWith(projectRoot + path.sep) &&
        !nodeModulesPaths.some(folder => realPath.startsWith(folder + path.sep))
      ) {
        linkedPackageDirs.push(realPath);
      }
      break;
    }
  }
  const watchFolders = [
    ...new Set([
      GPUI_PACKAGE_DIR,
      ...platformPackageDirs,
      ...linkedPackageDirs,
      activeUpstreamRNDir,
      ...nodeModulesPaths,
    ]),
  ];

  const baseConfig = mergeConfig(defaultConfig, {
    // These can be symlinked workspace packages; registering their real paths
    // keeps Metro's file map aware of the platform and upstream RN sources.
    watchFolders,
    resolver: {
      // `gpui` first so `Foo.gpui.js` wins; the generic `Foo.js` (rather than
      // the `ios`/`android` variants) is the fallback for desktop.
      platforms: ['gpui', 'native'],
      nodeModulesPaths,
      resolveRequest: resolveWithGpuiPlatform(defaultConfig),
    },
  });

  // The JS engine decides how its own bundles must be transformed (a bytecode
  // format needs an engine-specific transform profile, for example), so the
  // changes come from the active engine package rather than from this file.
  const engineBundle = activeJsEngineBundle(projectRoot);
  if (!engineBundle || typeof engineBundle.metroConfig !== 'function') {
    return baseConfig;
  }
  return mergeConfig(baseConfig, engineBundle.metroConfig(baseConfig) ?? {});
}

const config = makeMetroConfig();
Object.defineProperty(config, 'makeMetroConfig', { value: makeMetroConfig });
module.exports = config;
