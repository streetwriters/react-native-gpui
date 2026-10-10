import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { autolink, npxArgs, npxCommand, npxShell } from './autolink.js';

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(cliDir, '../templates');

/**
 * The Rust side probes GTK and AppIndicator through pkg-config while Cargo
 * builds. A non-system pkg-config first on PATH (Linuxbrew, Nix) cannot see the
 * system packages, and the failure surfaces much later as a cryptic C++ build
 * error, so check up front. Pure so it can be unit tested: `runPkgConfig`
 * returns true, false, or 'missing-pkg-config'.
 */
export function linuxBuildDependencyProblem(platform, runPkgConfig) {
  if (platform !== 'linux') return null;
  const modules = [
    { pc: 'gtk+-3.0', apt: 'libgtk-3-dev' },
    { pc: 'ayatana-appindicator3-0.1', apt: 'libayatana-appindicator3-dev' },
  ];
  for (const { pc, apt } of modules) {
    const result = runPkgConfig(pc);
    if (result === 'missing-pkg-config') {
      return (
        'pkg-config is required to build the desktop app on Linux. ' +
        'Install it with `sudo apt install pkg-config`, then re-run.'
      );
    }
    if (!result) {
      return (
        `Linux build dependency ${pc} was not found. ` +
        `Install it with \`sudo apt install ${apt}\`, then re-run. ` +
        'If pkg-config cannot see the system packages (Linuxbrew or Nix ' +
        'pkg-config first on PATH does this), set ' +
        'PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig ' +
        'and re-run.'
      );
    }
  }
  return null;
}

const run = (bin, args, options = {}) =>
  execFileSync(bin, args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: 'inherit',
    env: options.env ?? process.env,
    shell: options.shell ?? false,
  });

function loadEngineBundle(projectRoot) {
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  let platformPackageJson;
  try {
    platformPackageJson = appRequire.resolve('react-native-gpui/package.json');
  } catch {
    return null;
  }
  const { activeJsEngineBundle } = appRequire(
    path.join(path.dirname(platformPackageJson), 'js-engine.js'),
  );
  return activeJsEngineBundle(projectRoot);
}

function copyFontAssets(projectRoot, bundlePath, config) {
  const destination = path.join(
    path.dirname(bundlePath),
    'assets',
    'assets',
    'fonts',
  );
  fs.rmSync(destination, { recursive: true, force: true });
  const sources = [];
  const appFonts = path.join(projectRoot, 'desktop/assets/fonts');
  if (fs.existsSync(appFonts)) sources.push({ root: appFonts, prefix: 'app' });
  for (const [name, dependency] of Object.entries(config.dependencies ?? {})) {
    const root =
      dependency.root ?? path.join(projectRoot, 'node_modules', name);
    for (const assets of dependency.assets ?? []) {
      sources.push({
        root: path.resolve(root, assets),
        prefix: name.replaceAll('/', '-'),
      });
    }
  }
  let copied = 0;
  const copyDirectory = (sourceRoot, directory, prefix) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        copyDirectory(sourceRoot, source, prefix);
      } else if (/\.(?:ttf|otf)$/iu.test(entry.name)) {
        const relative = path.relative(sourceRoot, source);
        const target = path.join(destination, prefix, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        copied += 1;
      }
    }
  };
  for (const source of sources)
    copyDirectory(source.root, source.root, source.prefix);
  console.log(`Prepared ${copied} desktop font asset(s) in ${destination}`);
}

function cargoConfigSetsTargetDir(projectRoot) {
  let directory = path.resolve(projectRoot);
  while (true) {
    for (const fileName of ['config.toml', 'config']) {
      const configPath = path.join(directory, '.cargo', fileName);
      if (!fs.existsSync(configPath)) continue;
      const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/u);
      let inBuildTable = false;
      for (const line of lines) {
        const table = line.match(/^\s*\[([^\]]+)\]/u);
        if (table) {
          inBuildTable = table[1].trim() === 'build';
        } else if (inBuildTable && /^\s*target-dir\s*=/u.test(line)) {
          return true;
        }
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

async function isMetroRunning(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/status`, {
      signal: AbortSignal.timeout(1000),
    });
    return (
      response.ok && (await response.text()).includes('packager-status:running')
    );
  } catch {
    return false;
  }
}

async function ensureMetro({ projectRoot, desktopRoot, host, port, config }) {
  if (await isMetroRunning(host, port)) {
    console.log(`Reusing Metro at http://${host}:${port}`);
    return;
  }

  const logPath = path.join(desktopRoot, 'build/metro.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, 'a');
  const args = [
    'react-native',
    'start',
    '--host',
    host,
    '--port',
    String(port),
    '--no-interactive',
  ];
  if (config) args.push('--config', config);
  const server = spawn(npxCommand, npxArgs(args), {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: npxShell,
  });
  fs.closeSync(logFd);
  server.unref();
  let launchError;
  server.once('error', error => {
    launchError = error;
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isMetroRunning(host, port)) {
      console.log(`Started Metro at http://${host}:${port} (log: ${logPath})`);
      return;
    }
    if (launchError) throw launchError;
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    `Metro did not start at http://${host}:${port}. Check ${logPath} or run npx react-native start --port ${port}.`,
  );
}

export async function runDesktop({
  projectRoot = process.cwd(),
  entryFile,
  bundle,
  config,
  release = false,
  port = 8082,
  host = 'localhost',
  features,
  noLaunch = false,
}) {
  projectRoot = path.resolve(projectRoot);
  const dependencyProblem = linuxBuildDependencyProblem(
    process.platform,
    pc => {
      try {
        execFileSync('pkg-config', ['--exists', pc], { stdio: 'ignore' });
        return true;
      } catch (error) {
        return error?.code === 'ENOENT' ? 'missing-pkg-config' : false;
      }
    },
  );
  if (dependencyProblem) throw new Error(dependencyProblem);
  const desktopRoot = path.join(projectRoot, 'desktop');
  entryFile ??=
    ['index.js', 'index.ts', 'index.tsx'].find(file =>
      fs.existsSync(path.join(projectRoot, file)),
    ) ?? 'index.js';
  const bundlePath = path.resolve(
    projectRoot,
    bundle ?? path.join(desktopRoot, 'build/index.bundle'),
  );
  const metroConfig = path.resolve(
    projectRoot,
    config ?? path.join(desktopRoot, 'metro.config.js'),
  );

  // Autolink first: the manifest it writes tells the bundle path which engine is
  // active, and therefore which Metro transform and shipping format to use.
  const rnConfig = autolink({ projectRoot });
  const engineBundle = loadEngineBundle(projectRoot);

  // What the runtime loads: the plain Metro bundle, or the engine's compiled
  // format (`.hbc` bytecode, for example).
  let runtimeBundlePath = bundlePath;

  if (release) {
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
    const bundleArgs = [
      'react-native',
      'bundle',
      '--platform',
      'gpui',
      '--entry-file',
      entryFile,
      '--bundle-output',
      bundlePath,
      '--assets-dest',
      path.join(path.dirname(bundlePath), 'assets'),
      '--dev',
      'false',
    ];
    if (fs.existsSync(metroConfig)) bundleArgs.push('--config', metroConfig);
    run(npxCommand, npxArgs(bundleArgs), { cwd: projectRoot, shell: npxShell });

    if (engineBundle && typeof engineBundle.compile === 'function') {
      const extension =
        typeof engineBundle.bundleExtension === 'string'
          ? engineBundle.bundleExtension
          : '.js';
      const compiledPath = `${bundlePath.replace(/\.[^./\\]+$/u, '')}${extension}`;
      const compiled = engineBundle.compile({
        input: bundlePath,
        output: compiledPath,
        dev: false,
      });
      runtimeBundlePath = path.resolve(
        projectRoot,
        compiled?.output ?? compiledPath,
      );
    }
  } else {
    const numericPort = Number(port);
    if (
      !Number.isInteger(numericPort) ||
      numericPort < 1 ||
      numericPort > 65535
    ) {
      throw new Error(`--port must be an integer between 1 and 65535`);
    }
    await ensureMetro({
      projectRoot,
      desktopRoot,
      host,
      port: numericPort,
      config: fs.existsSync(metroConfig) ? metroConfig : undefined,
    });
  }
  copyFontAssets(projectRoot, bundlePath, rnConfig);

  const appCargoManifest = path.join(desktopRoot, 'Cargo.toml');
  if (!fs.existsSync(appCargoManifest)) {
    throw new Error(`missing desktop Cargo manifest: ${appCargoManifest}`);
  }
  const cargoArgs = [noLaunch ? 'build' : 'run'];
  if (release) cargoArgs.push('--release');
  const cargoFeatures = (features ?? '')
    .split(',')
    .map(feature => feature.trim())
    .filter(Boolean);
  if (cargoFeatures.some(feature => !/^[A-Za-z0-9_/-]+$/u.test(feature))) {
    throw new Error(
      '--features must be a comma-separated list of Cargo features',
    );
  }
  if (cargoFeatures.length > 0)
    cargoArgs.push('--features', cargoFeatures.join(','));
  cargoArgs.push('--manifest-path', appCargoManifest);
  const cargoEnv = {
    ...process.env,
    RN_GPUI_BUNDLE: runtimeBundlePath,
    RN_GPUI_ASSETS_DIR: path.join(path.dirname(bundlePath), 'assets', 'assets'),
    RN_GPUI_SOURCE_URL: entryFile.replace(/\.[^.]+$/u, ''),
    RN_GPUI_DEV_HOST: host,
    RN_GPUI_DEV_PORT: String(port),
    RN_GPUI_AUTOLINK_MANIFEST: path.join(desktopRoot, 'autolink/autolink.json'),
    RN_GPUI_AUTOLINK_CMAKE: path.join(desktopRoot, 'autolink/autolink.cmake'),
  };
  if (
    process.env.CARGO_TARGET_DIR === undefined &&
    !cargoConfigSetsTargetDir(projectRoot)
  ) {
    cargoEnv.CARGO_TARGET_DIR = path.join(desktopRoot, 'build/target');
  }
  run('cargo', cargoArgs, {
    cwd: projectRoot,
    env: cargoEnv,
  });
}

const appPackageName = (projectRoot, packageJson) =>
  `react-native-gpui-${(packageJson.name ?? path.basename(projectRoot))
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, '-')}`;

const appIdFromName = name =>
  `com.example.${name.toLowerCase().replaceAll(/[^a-z0-9-]/gu, '-')}`;

function snapshotTree(root, track, rememberDirectory, existingDirectories) {
  if (!fs.existsSync(root)) {
    rememberDirectory(root);
    return;
  }
  existingDirectories.add(root);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      snapshotTree(target, track, rememberDirectory, existingDirectories);
    } else track(target);
  }
}

function removeNewFiles(root, snapshots, existingDirectories) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory())
      removeNewFiles(target, snapshots, existingDirectories);
    else if (!snapshots.has(target)) {
      fs.rmSync(target, { force: true, recursive: true });
    }
  }
  if (!existingDirectories.has(root)) {
    try {
      fs.rmdirSync(root);
    } catch {}
  }
}

const desktopFiles = directory =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? desktopFiles(fullPath)
      : [path.relative(path.join(templatesDir, 'app'), fullPath)];
  });

function desktopNumber(value, fallback, label, appConfigPath) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number: ${appConfigPath}`);
  }
  return value;
}

export function desktopLaunchConfig(appConfig, appConfigPath) {
  const desktop = appConfig.desktop ?? {};
  const window = desktop.window;
  const hasWindow = window !== undefined;
  const hasDevMenu = typeof desktop.devMenu === 'boolean';
  const hasTray = desktop.tray !== undefined;
  if (!hasWindow && !hasDevMenu && !hasTray) return null;
  if (
    hasWindow &&
    (typeof window !== 'object' || window === null || Array.isArray(window))
  ) {
    throw new Error(
      `app.json desktop.window must be an object: ${appConfigPath}`,
    );
  }
  if (
    hasTray &&
    (typeof desktop.tray !== 'object' ||
      desktop.tray === null ||
      Array.isArray(desktop.tray))
  ) {
    throw new Error(
      `app.json desktop.tray must be an object: ${appConfigPath}`,
    );
  }

  const settings = window ?? {};
  const title =
    settings.title === undefined
      ? 'env!("RN_GPUI_APP_NAME")'
      : JSON.stringify(
          typeof settings.title === 'string'
            ? settings.title
            : (() => {
                throw new Error(
                  `app.json desktop.window.title must be a string: ${appConfigPath}`,
                );
              })(),
        );
  const width = desktopNumber(
    settings.width,
    1024,
    'app.json desktop.window.width',
    appConfigPath,
  );
  const height = desktopNumber(
    settings.height,
    768,
    'app.json desktop.window.height',
    appConfigPath,
  );

  const chain = [
    `    .window_title(${title})`,
    `    .window_size(${width}, ${height})`,
  ];
  if (settings.position !== undefined) {
    const position = settings.position;
    if (
      typeof position !== 'object' ||
      position === null ||
      Array.isArray(position)
    ) {
      throw new Error(
        `app.json desktop.window.position must be an object: ${appConfigPath}`,
      );
    }
    const x = desktopNumber(
      position.x,
      undefined,
      'app.json desktop.window.position.x',
      appConfigPath,
    );
    const y = desktopNumber(
      position.y,
      undefined,
      'app.json desktop.window.position.y',
      appConfigPath,
    );
    if (x === undefined || y === undefined) {
      throw new Error(
        `app.json desktop.window.position needs x and y: ${appConfigPath}`,
      );
    }
    chain.push(`    .window_position(${x}, ${y})`);
  }
  if (settings.restoreState === false) {
    chain.push('    .restore_window_state(false)');
  }
  if (hasDevMenu) {
    chain.push(`    .dev_menu(${desktop.devMenu})`);
  }
  if (hasTray) {
    const tray = desktop.tray;
    let trayChain = 'TrayConfig::default()';
    if (tray.component !== undefined) {
      if (typeof tray.component !== 'string' || tray.component.length === 0) {
        throw new Error(
          `app.json desktop.tray.component must be a non-empty string: ${appConfigPath}`,
        );
      }
      trayChain += `.component(${JSON.stringify(tray.component)})`;
    }
    if (tray.tooltip !== undefined) {
      if (typeof tray.tooltip !== 'string') {
        throw new Error(
          `app.json desktop.tray.tooltip must be a string: ${appConfigPath}`,
        );
      }
      trayChain += `.tooltip(${JSON.stringify(tray.tooltip)})`;
    }
    if (tray.accessory === false) {
      trayChain += '.accessory(false)';
    }
    chain.push(`    .tray(${trayChain})`);
  }
  chain.push(`    .configure_window(|options| {
        // GPUI window options are public: titlebar, resizability, display,
        // decorations, min size, and other native window behavior.
        options.is_resizable = ${settings.resizable === false ? 'false' : 'true'};
    })`);

  return `//! Project-owned desktop launch configuration.
//!
//! Generated by \`init-desktop\` from the \`desktop\` key in \`app.json\`; edit
//! either that file and re-run \`npx react-native init-desktop\`, or this file
//! directly. See \`desktop/README.md\` for the full set of options.
//!
//! Add \`mod my_turbo_module;\` here for local Rust TurboModules. Put matching
//! \`Native*.ts\` specs beside this file; \`run-desktop\` discovers and codegens
//! those specs automatically.

fn main() {
    if std::env::var_os("RN_GPUI_BUNDLE").is_none() {
        std::env::set_var("RN_GPUI_BUNDLE", env!("RN_GPUI_DEFAULT_BUNDLE"));
    }
    let config = react_native_gpui::DesktopAppConfig::from_env_with_defaults(
        env!("RN_GPUI_APP_NAME"),
        env!("RN_GPUI_APP_ID"),
    )
${chain.join('\n')};

    react_native_gpui::run_with(config);
}
`;
}

function scaffoldDesktop(
  projectRoot,
  packageJson,
  { preserveExisting = false, beforeWrite = () => {} } = {},
) {
  const desktopTemplate = path.join(templatesDir, 'app/desktop');
  for (const relativePath of desktopFiles(desktopTemplate)) {
    const targetRelativePath =
      relativePath === 'desktop/gitignore'
        ? 'desktop/.gitignore'
        : relativePath;
    const target = path.join(projectRoot, targetRelativePath);
    if (preserveExisting && fs.existsSync(target)) continue;
    beforeWrite(target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(templatesDir, 'app', relativePath), target);
  }

  const cargoPath = path.join(projectRoot, 'desktop/Cargo.toml');
  if (!preserveExisting || !fs.existsSync(cargoPath)) {
    beforeWrite(cargoPath);
    fs.writeFileSync(
      cargoPath,
      `[package]\nname = ${JSON.stringify(appPackageName(projectRoot, packageJson))}\nversion = "0.1.0"\nedition = "2021"\n\n# Set CARGO_PROFILE_DEV_DEBUG=full to opt into full debug information.\n[profile.dev]\ndebug = "line-tables-only"\nsplit-debuginfo = "packed"\n\n# Dependencies are optimized even in a dev build: GPUI rebuilds and paints the\n# element tree on every frame, and they are only compiled once.\n[profile.dev.package."*"]\ndebug = false\nopt-level = 3\n\n# The C++ bridge picks its CMake build type from this crate's opt-level, and a\n# Release build of React Native has no dev server, inspector or Fast Refresh.\n[profile.dev.package.rn-gpui-sys]\nopt-level = 0\n\n[profile.release]\ndebug = false\nstrip = "debuginfo"\n\n[build-dependencies]\nserde_json = "1"\n\n[dependencies]\n`,
    );
  }

  const appConfigPath = path.join(projectRoot, 'app.json');
  if (!fs.existsSync(appConfigPath)) {
    throw new Error(`missing React Native app config: ${appConfigPath}`);
  }
  const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
  if (typeof appConfig.name !== 'string' || appConfig.name.length === 0) {
    throw new Error(`app.json must define a nonempty name: ${appConfigPath}`);
  }
  if (
    appConfig.desktop !== undefined &&
    (typeof appConfig.desktop !== 'object' ||
      appConfig.desktop === null ||
      Array.isArray(appConfig.desktop))
  ) {
    throw new Error(`app.json desktop must be an object: ${appConfigPath}`);
  }
  const appId = appConfig.desktop?.appId ?? appIdFromName(appConfig.name);
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error(
      `app.json desktop.appId must be a nonempty string: ${appConfigPath}`,
    );
  }
  const launchConfig = desktopLaunchConfig(appConfig, appConfigPath);
  if (launchConfig !== null) {
    const mainPath = path.join(projectRoot, 'desktop/src/main.rs');
    if (!preserveExisting || !fs.existsSync(mainPath)) {
      beforeWrite(mainPath);
      fs.writeFileSync(mainPath, launchConfig);
    }
  }
  const updatedAppConfig = {
    ...appConfig,
    desktop: { ...appConfig.desktop, appId },
  };
  const serializedAppConfig = `${JSON.stringify(updatedAppConfig, null, 2)}\n`;
  if (fs.readFileSync(appConfigPath, 'utf8') !== serializedAppConfig) {
    beforeWrite(appConfigPath);
    fs.writeFileSync(appConfigPath, serializedAppConfig);
  }

  const updatedPackageJson = {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      'react-native-gpui':
        packageJson.dependencies?.['react-native-gpui'] ?? '^0.1.0',
      '@react-native-gpui/hermes':
        packageJson.dependencies?.['@react-native-gpui/hermes'] ?? '^0.1.0',
    },
    scripts: {
      ...packageJson.scripts,
      'test:e2e':
        packageJson.scripts?.['test:e2e'] ??
        'vitest run --config desktop/vitest.e2e.config.ts',
    },
    devDependencies: {
      ...packageJson.devDependencies,
      vitest: packageJson.devDependencies?.vitest ?? '^3.2.4',
      '@react-native-gpui/testing':
        packageJson.devDependencies?.['@react-native-gpui/testing'] ?? '^0.1.0',
      '@react-native-gpui/cli':
        packageJson.devDependencies?.['@react-native-gpui/cli'] ?? '^0.1.0',
    },
  };
  return updatedPackageJson;
}

export function initDesktop({
  projectRoot = process.cwd(),
  skipInstall = false,
}) {
  projectRoot = path.resolve(projectRoot);
  const snapshots = new Map();
  const createdDirectories = new Set();
  const existingDirectories = new Set();
  const track = file => {
    if (!snapshots.has(file)) {
      snapshots.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
    }
  };
  try {
    const packagePath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`no package.json found in ${projectRoot}`);
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (
      !packageJson.dependencies?.['react-native'] &&
      !packageJson.devDependencies?.['react-native']
    ) {
      throw new Error('package.json does not declare react-native');
    }

    const updatedPackageJson = scaffoldDesktop(projectRoot, packageJson, {
      preserveExisting: true,
      beforeWrite(file) {
        track(file);
        let directory = path.dirname(file);
        const missingDirectories = [];
        while (directory.startsWith(projectRoot) && !fs.existsSync(directory)) {
          missingDirectories.push(directory);
          directory = path.dirname(directory);
        }
        missingDirectories.forEach(item => createdDirectories.add(item));
      },
    });
    track(packagePath);
    fs.writeFileSync(
      packagePath,
      `${JSON.stringify(updatedPackageJson, null, 2)}\n`,
    );

    if (!skipInstall) {
      const manager = fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : fs.existsSync(path.join(projectRoot, 'yarn.lock'))
          ? 'yarn'
          : fs.existsSync(path.join(projectRoot, 'bun.lockb')) ||
              fs.existsSync(path.join(projectRoot, 'bun.lock'))
            ? 'bun'
            : 'npm';
      for (const lock of [
        'package-lock.json',
        'npm-shrinkwrap.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'bun.lock',
        'bun.lockb',
      ]) {
        const file = path.join(projectRoot, lock);
        track(file);
      }
      run(manager, ['install'], { cwd: projectRoot });
    }

    const desktopRoot = path.join(projectRoot, 'desktop');
    const autolinkRoot = path.join(desktopRoot, 'autolink');
    const buildRoot = path.join(desktopRoot, 'build');
    const rememberDirectory = directory => {
      for (
        let current = directory;
        current.startsWith(projectRoot) && !fs.existsSync(current);
        current = path.dirname(current)
      ) {
        createdDirectories.add(current);
      }
    };
    snapshotTree(autolinkRoot, track, rememberDirectory, existingDirectories);
    const assetsRoot = path.join(buildRoot, 'assets');
    snapshotTree(assetsRoot, track, rememberDirectory, existingDirectories);
    const bundlePath = path.join(buildRoot, 'index.bundle');
    track(bundlePath);
    track(path.join(desktopRoot, 'Cargo.toml'));
    track(path.join(desktopRoot, 'src/main.rs'));
    autolink({ projectRoot });

    if (!fs.existsSync(bundlePath)) {
      rememberDirectory(assetsRoot);
      run(
        npxCommand,
        npxArgs([
          'react-native',
          'bundle',
          '--platform',
          'gpui',
          '--entry-file',
          ['index.js', 'index.ts', 'index.tsx'].find(file =>
            fs.existsSync(path.join(projectRoot, file)),
          ) ?? 'index.js',
          '--bundle-output',
          bundlePath,
          '--assets-dest',
          assetsRoot,
          '--config',
          path.join(desktopRoot, 'metro.config.js'),
          '--dev',
          'false',
        ]),
        { cwd: projectRoot, shell: npxShell },
      );
    }
    console.log(
      `Added GPUI desktop support to ${projectRoot}. Run npx react-native run-desktop.`,
    );
  } catch (error) {
    removeNewFiles(
      path.join(projectRoot, 'desktop/autolink'),
      snapshots,
      existingDirectories,
    );
    removeNewFiles(
      path.join(projectRoot, 'desktop/build/assets'),
      snapshots,
      existingDirectories,
    );
    const bundlePath = path.join(projectRoot, 'desktop/build/index.bundle');
    if (snapshots.get(bundlePath) === null) {
      fs.rmSync(bundlePath, { force: true });
    }
    for (const [file, contents] of [...snapshots.entries()].reverse()) {
      if (contents === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, contents);
    }
    for (const directory of [...createdDirectories].sort(
      (left, right) => right.length - left.length,
    )) {
      try {
        fs.rmdirSync(directory);
      } catch {}
    }
    console.error(
      `init-desktop failed and restored its file changes: ${error.message}`,
    );
    console.error('Manual steps to add desktop support:');
    for (const step of [
      'Install react-native-gpui and @react-native-gpui/cli in the app.',
      'Copy the desktop/ scaffold from @react-native-gpui/cli/templates/app/desktop.',
      'Run npm install (or your package manager), then npx react-native run-desktop.',
    ]) {
      console.error(`  - ${step}`);
    }
    throw error;
  }
}

export function initProject({ appName, destination, initArgs = [] }) {
  destination = path.resolve(destination);
  const destinationExisted = fs.existsSync(destination);
  if (destinationExisted && fs.readdirSync(destination).length) {
    throw new Error(`destination is not empty: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    run(
      npxCommand,
      npxArgs([
        '--yes',
        '@react-native-community/cli@^20.2.0',
        'init',
        appName,
        '--version',
        '0.87.1',
        '--skip-install',
        '--directory',
        destination,
        ...initArgs,
      ]),
      { shell: npxShell },
    );
    const packagePath = path.join(destination, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    fs.writeFileSync(
      packagePath,
      `${JSON.stringify(scaffoldDesktop(destination, packageJson), null, 2)}\n`,
    );
    fs.copyFileSync(
      path.join(templatesDir, 'app/App.tsx'),
      path.join(destination, 'App.tsx'),
    );
    console.log(
      `Created standard React Native project ${appName} (iOS, Android, and GPUI desktop) in ${destination}. Run npm install, then npx react-native run-desktop.`,
    );
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    if (destinationExisted) fs.mkdirSync(destination, { recursive: true });
    throw error;
  }
}

export function createLibrary({
  libraryName,
  type = 'rust',
  destination,
  moduleName: requestedModuleName,
  packageName: requestedPackageName,
}) {
  if (
    !libraryName ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(libraryName) ||
    !['rust', 'cpp'].includes(type)
  ) {
    throw new Error(
      'create-library requires a valid name and rust or cpp type',
    );
  }
  destination = path.resolve(destination ?? libraryName);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
    throw new Error(`destination is not empty: ${destination}`);
  }
  const slug = libraryName
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, '-');
  const snakeCase = value =>
    value
      .replaceAll(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replaceAll(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
      .toLowerCase();
  const words = libraryName.match(/[A-Z]?[a-z0-9]+|[A-Z]+/gu) ?? [libraryName];
  const moduleStem = words
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  const moduleName = requestedModuleName ?? `RN${moduleStem}Module`;
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(moduleName)) {
    throw new Error('--module-name must be a PascalCase identifier');
  }
  const specName = `Native${moduleStem}`;
  const cppProvider = `create_${slug.replaceAll('-', '_')}_module`;
  const packageName = requestedPackageName ?? `react-native-${slug}`;
  // Two names have to line up: `<codegenName>JSI.h` is the generated header, and
  // the spec class is named after the spec file (`src/${specName}.ts`). The C++
  // template writes `RNModuleSpec` and `NativeModuleCxxSpec`, which the
  // replacements below turn into exactly these two names.
  const codegenName = `${moduleName}Spec`;
  const templateRoot = path.join(templatesDir, `modules/${type}`);
  fs.mkdirSync(destination, { recursive: true });
  const moduleFiles =
    type === 'rust'
      ? {
          [`src/${specName}.ts`]: 'NativeModule.ts',
          'src/index.ts': 'index.ts',
          'gpui/build.rs': 'build.rs',
          'gpui/src/lib.rs': 'lib.rs',
        }
      : {
          [`src/${specName}.ts`]: 'NativeModule.ts',
          'src/index.ts': 'index.ts',
          [`gpui/cpp/${moduleName}.hpp`]: 'RNModule.hpp',
          [`gpui/cpp/${moduleName}.cpp`]: 'RNModule.cpp',
          'gpui/CMakeLists.txt': 'CMakeLists.txt',
        };
  for (const [target, source] of Object.entries(moduleFiles)) {
    const targetPath = path.join(destination, target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const contents = fs
      .readFileSync(path.join(templateRoot, source), 'utf8')
      .replaceAll('RNMODULESNAKE', snakeCase(moduleStem))
      .replaceAll('NativeModule', specName)
      .replaceAll('RNMODULE', moduleName.toUpperCase())
      .replaceAll('RNModule', moduleName)
      .replaceAll('create_rn_module', cppProvider);
    fs.writeFileSync(targetPath, contents);
  }

  const platformConfig =
    type === 'rust'
      ? { crate: `rn-gpui-${slug}` }
      : { cmake: 'gpui', cppProvider };
  const packageJson = {
    name: packageName,
    version: '0.1.0',
    main: 'src/index.ts',
    files: ['src', 'gpui', 'react-native.config.js', 'README.md'],
    codegenConfig: {
      name: codegenName,
      type: 'modules',
      jsSrcsDir: 'src',
    },
    peerDependencies: { 'react-native': '>=0.76' },
  };
  fs.writeFileSync(
    path.join(destination, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(destination, 'react-native.config.js'),
    [
      'module.exports = {',
      '  dependency: {',
      '    platforms: {',
      '      gpui: {',
      ...Object.entries(platformConfig).map(
        ([key, value]) => `        ${key}: ${JSON.stringify(value)},`,
      ),
      '      },',
      '    },',
      '  },',
      '};',
      '',
    ].join('\n'),
  );
  if (type === 'rust') {
    const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
    const platformPackageJson = appRequire.resolve(
      'react-native-gpui/package.json',
    );
    const platformRustRoot = path.join(
      path.dirname(platformPackageJson),
      'ReactGpui',
    );
    const cratePath = crate =>
      path.relative(
        path.join(destination, 'gpui'),
        path.join(platformRustRoot, crate),
      );
    fs.writeFileSync(
      path.join(destination, 'gpui/Cargo.toml'),
      `[package]\nname = ${JSON.stringify(`rn-gpui-${slug}`)}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nrn-gpui-module = { path = ${JSON.stringify(cratePath('rn-gpui-module'))} }\n\n[build-dependencies]\nrn-gpui-module-build = { path = ${JSON.stringify(cratePath('rn-gpui-module-build'))} }\n`,
    );
  }
  const exampleRoot = path.join(destination, 'example');
  fs.mkdirSync(exampleRoot, { recursive: true });
  fs.writeFileSync(
    path.join(exampleRoot, 'app.json'),
    `${JSON.stringify({ name: `${moduleStem}Example`, displayName: `${moduleStem} Example` }, null, 2)}\n`,
  );
  const examplePackage = scaffoldDesktop(exampleRoot, {
    name: `${slug}-example`,
    version: '0.0.1',
    private: true,
    dependencies: {
      react: '19.2.3',
      'react-native': '0.87.1',
      [packageName]: 'file:..',
    },
    devDependencies: {
      '@react-native-community/cli': '^20.2.0',
      '@react-native/babel-preset': '0.87.1',
      '@react-native/metro-config': '0.87.1',
      vitest: '^3.2.4',
    },
  });
  fs.writeFileSync(
    path.join(exampleRoot, 'package.json'),
    `${JSON.stringify(examplePackage, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(exampleRoot, 'babel.config.cjs'),
    "module.exports = {presets: ['module:@react-native/babel-preset']};\n",
  );
  fs.writeFileSync(
    path.join(exampleRoot, 'index.ts'),
    "import {AppRegistry} from 'react-native';\nimport App from './App';\nimport {name} from './app.json';\nAppRegistry.registerComponent(name, () => App);\n",
  );
  fs.writeFileSync(
    path.join(exampleRoot, 'App.tsx'),
    `import React from 'react';\nimport {Text, View} from 'react-native';\nimport Module from ${JSON.stringify(packageName)};\nexport default function App() {\n  return <View testID="desktop-app-root" style={{flex: 1, padding: 32}}><Text testID="library-result">{Module.greet('Desktop')}</Text></View>;\n}\n`,
  );
  fs.writeFileSync(
    path.join(exampleRoot, 'desktop/e2e/library.e2e.ts'),
    "import {launchApp, expect as desktopExpect} from '@react-native-gpui/testing';\ntest('calls the native library', async () => {\n  const app = await launchApp({disableAnimations: true});\n  await desktopExpect(app.getByTestId('library-result')).toContainText('Desktop');\n});\n",
  );

  const language = type === 'rust' ? 'Rust' : 'C++';
  const implementation =
    type === 'rust' ? 'gpui/src/lib.rs' : `gpui/cpp/${moduleName}.cpp`;
  const description =
    type === 'rust'
      ? 'call its typed greet(name) method.'
      : 'implement methods defined by its generated spec.';
  fs.writeFileSync(
    path.join(destination, 'README.md'),
    `# ${libraryName}\n\n${language} TurboModule library for React Native GPUI. The spec is in src/${specName}.ts and uses React Native's public TurboModuleRegistry API. The implementation is in ${implementation} and is discovered through package metadata. Import the default export from ${packageName} and ${description}\n`,
  );
  console.log(
    `Created ${type} TurboModule library ${packageName} in ${destination}. Install/link it in a React Native app, then run npx react-native run-desktop.`,
  );
}
