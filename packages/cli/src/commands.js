import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { autolink, npxArgs, npxCommand, npxShell } from './autolink.js';
import { loadDesktopConfig } from './desktop-config.js';

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(cliDir, '../templates');

/**
 * The app links the system xkbcommon and xcb libraries, and a missing one only
 * surfaces at the end of a long build as a linker error, so check up front.
 * A non-system pkg-config first on PATH (Linuxbrew, Nix) cannot see the system
 * packages. Pure so it can be unit tested: `runPkgConfig`
 * returns true, false, or 'missing-pkg-config'; `systemPkgConfigPath` returns
 * the system pkg-config search path, or null when it cannot be determined.
 *
 * The message stays distribution-neutral: it names the pkg-config module and
 * gives one install command per common package manager, and the path hint uses
 * whatever this machine's system pkg-config reports rather than a hard-coded
 * x86_64 Debian path.
 */
export function linuxBuildDependencyProblem(
  platform,
  runPkgConfig,
  systemPkgConfigPath = () => null,
) {
  if (platform !== 'linux') return null;
  // The libraries the app links on Linux (GPUI's keyboard handling over X11).
  const modules = [
    {
      pc: 'xkbcommon',
      packages: {
        'Debian/Ubuntu': 'libxkbcommon-dev',
        Fedora: 'libxkbcommon-devel',
        Arch: 'libxkbcommon',
      },
    },
    {
      pc: 'xkbcommon-x11',
      packages: {
        'Debian/Ubuntu': 'libxkbcommon-x11-dev',
        Fedora: 'libxkbcommon-x11-devel',
        Arch: 'libxkbcommon-x11',
      },
    },
    {
      pc: 'xcb',
      packages: {
        'Debian/Ubuntu': 'libxcb1-dev',
        Fedora: 'libxcb-devel',
        Arch: 'libxcb',
      },
    },
  ];
  const installExamples = packages =>
    Object.entries(packages)
      .map(([distribution, name]) => {
        const manager =
          distribution === 'Fedora'
            ? 'dnf'
            : distribution === 'Arch'
              ? 'pacman'
              : 'apt';
        const command =
          manager === 'pacman'
            ? `sudo pacman -S ${name}`
            : `sudo ${manager} install ${name}`;
        return `${distribution}: ${command}`;
      })
      .join(', ');
  for (const { pc, packages } of modules) {
    const result = runPkgConfig(pc);
    if (result === 'missing-pkg-config') {
      return (
        'pkg-config is required to build the desktop app on Linux. ' +
        "Install your distribution's pkg-config package " +
        '(Debian/Ubuntu: `sudo apt install pkg-config`, ' +
        'Fedora: `sudo dnf install pkgconf-pkg-config`, ' +
        'Arch: `sudo pacman -S pkgconf`), then re-run.'
      );
    }
    if (!result) {
      const systemPath = systemPkgConfigPath();
      const hint = systemPath
        ? `set PKG_CONFIG_PATH=${systemPath} and re-run.`
        : 'point PKG_CONFIG_PATH at your system pkgconfig directories and re-run.';
      return (
        `Linux build dependency ${pc} was not found. ` +
        `Install your distribution's development package for it ` +
        `(${installExamples(packages)}). ` +
        `If pkg-config cannot see the system packages (Linuxbrew or Nix ` +
        `pkg-config first on PATH does this), ${hint}`
      );
    }
  }
  return null;
}

/**
 * The system pkg-config search path, for the preflight hint. Uses
 * `/usr/bin/pkg-config` explicitly: a Linuxbrew or Nix `pkg-config` first on
 * PATH is exactly the situation the hint is about, and it reports its own
 * prefix, not the system one. Returns null when the binary is missing or the
 * query fails.
 */
function readSystemPkgConfigPath() {
  const pkgConfig = '/usr/bin/pkg-config';
  if (!fs.existsSync(pkgConfig)) return null;
  try {
    const output = execFileSync(
      pkgConfig,
      ['--variable', 'pc_path', 'pkg-config'],
      { encoding: 'utf8' },
    ).trim();
    return output || null;
  } catch {
    return null;
  }
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
    platformPackageJson = appRequire.resolve(
      '@react-native-gpui/core/package.json',
    );
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
    readSystemPkgConfigPath,
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
      'desktop',
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

/**
 * The `main.rs` an app's `desktop.json` describes.
 *
 * The window, dev-menu and tray chain is unchanged from when these options
 * lived in `app.json`; only where they are read from moved.
 */
export function desktopLaunchConfig(config, configPath) {
  const settings = config.window ?? {};
  const title =
    settings.title === undefined
      ? 'env!("RN_GPUI_APP_NAME")'
      : JSON.stringify(settings.title);
  const width = settings.width;
  const height = settings.height;

  const chain = [
    `    .window_title(${title})`,
    `    .window_size(${width}, ${height})`,
  ];
  if (settings.position !== undefined) {
    const { x, y } = settings.position;
    if (x === undefined || y === undefined) {
      throw new Error(
        `desktop/desktop.json window.position needs x and y: ${configPath}`,
      );
    }
    chain.push(`    .window_position(${x}, ${y})`);
  }
  if (settings.restoreState === false) {
    chain.push('    .restore_window_state(false)');
  }
  chain.push(`    .dev_menu(${config.devMenu})`);
  if (config.tray !== undefined) {
    const tray = config.tray;
    let trayChain = 'TrayConfig::default()';
    if (tray.component !== undefined) {
      trayChain += `.component(${JSON.stringify(tray.component)})`;
    }
    if (tray.tooltip !== undefined) {
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
//! Generated by \`init-desktop\` from \`desktop/desktop.json\`; edit that file and
//! re-run \`npx react-native init-desktop\`, or this file directly. See
//! \`desktop/README.md\` for the full set of options.
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
  // Every launch setting comes from `desktop/desktop.json`; `app.json`'s old
  // `desktop` key is rejected by the loader with a pointer to the new file.
  const launchConfig = desktopLaunchConfig(
    loadDesktopConfig(projectRoot, process.platform),
    path.join(projectRoot, 'desktop/desktop.json'),
  );
  if (launchConfig !== null) {
    const mainPath = path.join(projectRoot, 'desktop/src/main.rs');
    if (!preserveExisting || !fs.existsSync(mainPath)) {
      beforeWrite(mainPath);
      fs.writeFileSync(mainPath, launchConfig);
    }
  }

  const updatedPackageJson = {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      '@react-native-gpui/core':
        packageJson.dependencies?.['@react-native-gpui/core'] ?? '^0.1.0',
      '@react-native-gpui/hermes':
        packageJson.dependencies?.['@react-native-gpui/hermes'] ?? '^0.1.0',
      // `rn-gpui-module-build` resolves its spec generator from the app
      // (`require.resolve('@react-native-gpui/codegen/generate-rust-spec')` with
      // the crate directory as the search path), so the app must depend on it
      // directly. Inside this repository the workspace hoists it and a missing
      // entry goes unnoticed; an app installed from the registry fails with
      // "Cannot find module '@react-native-gpui/codegen/generate-rust-spec'".
      '@react-native-gpui/codegen':
        packageJson.dependencies?.['@react-native-gpui/codegen'] ?? '^0.1.0',
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
          'desktop',
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
      'Install @react-native-gpui/core and @react-native-gpui/cli in the app.',
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
          'desktop/build.rs': 'build.rs',
          'desktop/src/lib.rs': 'lib.rs',
        }
      : {
          [`src/${specName}.ts`]: 'NativeModule.ts',
          'src/index.ts': 'index.ts',
          [`desktop/cpp/${moduleName}.hpp`]: 'RNModule.hpp',
          [`desktop/cpp/${moduleName}.cpp`]: 'RNModule.cpp',
          'desktop/CMakeLists.txt': 'CMakeLists.txt',
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
      : { cmake: 'desktop', cppProvider };
  const packageJson = {
    name: packageName,
    version: '0.1.0',
    main: 'src/index.ts',
    files: ['src', 'desktop', 'react-native.config.js', 'README.md'],
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
      '      desktop: {',
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
      '@react-native-gpui/core/package.json',
    );
    const platformRustRoot = path.join(
      path.dirname(platformPackageJson),
      'ReactGpui',
    );
    const cratePath = crate =>
      path.relative(
        path.join(destination, 'desktop'),
        path.join(platformRustRoot, crate),
      );
    fs.writeFileSync(
      path.join(destination, 'desktop/Cargo.toml'),
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
    type === 'rust' ? 'desktop/src/lib.rs' : `desktop/cpp/${moduleName}.cpp`;
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

/**
 * The `_requireNodeLibrary(key, path)` calls the Babel plugin emits, as they
 * appear in a bundle. Babel's output quotes both arguments with double quotes
 * and escapes anything unusual, so this matches the compact and pretty forms
 * alike. The key never contains a quote or a backslash (see the plugin's
 * `addonKey`), which is what keeps the pattern simple.
 */
const requireNodeLibraryCallPattern =
  /_requireNodeLibrary\(\s*"([^"\\]+)"\s*,\s*"((?:[^"\\]|\\.)+)"\s*\)/gu;

/**
 * The Node addon entries a bundle asks for: `{ key, path }`, in the order the
 * calls appear, with the escapes Babel produced removed from the path.
 *
 * Exported for the unit test: scanning is the part worth testing without
 * touching the filesystem.
 */
export function scanNodeAddonCalls(bundleText) {
  const found = [];
  const seen = new Set();
  for (const match of bundleText.matchAll(requireNodeLibraryCallPattern)) {
    const key = match[1];
    // The path was emitted by `t.stringLiteral`, so it is escaped the way a JS
    // string literal is. `JSON.parse` undoes exactly that.
    let filePath;
    try {
      filePath = JSON.parse(`"${match[2]}"`);
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ key, path: filePath });
  }
  return found;
}

/** Sibling shared libraries a `$ORIGIN` / `@loader_path` lookup may need. */
function isSiblingSharedLibrary(name, platform) {
  if (platform === 'darwin') return name.endsWith('.dylib');
  if (platform === 'win32') return name.endsWith('.dll');
  // Linux: `libfoo.so` and its versioned forms `libfoo.so.1`, `libfoo.so.1.2`.
  return /\.so(?:\.\d+)*$/u.test(name);
}

/**
 * `react-native-gpui collect-node-addons --bundle <bundle.js> --out <dir>`
 *
 * A development build loads an addon from the absolute path the Babel plugin
 * embedded. A packaged app has no such path, so it copies each addon to
 * `<out>/<key>` — which is what `_requireNodeLibrary` looks for relative to the
 * executable — together with any sibling shared libraries, since some addons
 * load those through `$ORIGIN` / `@loader_path`.
 *
 * Fails loudly when an embedded path no longer exists: a bundle built against a
 * stale tree would otherwise ship without the addon and fail at run time.
 */
export function collectNodeAddons({
  bundle,
  out,
  platform = process.platform,
} = {}) {
  if (!bundle) throw new Error('collect-node-addons requires --bundle <path>');
  if (!out) throw new Error('collect-node-addons requires --out <dir>');
  const bundlePath = path.resolve(bundle);
  const outDirectory = path.resolve(out);
  const bundleText = fs.readFileSync(bundlePath, 'utf8');
  const addons = scanNodeAddonCalls(bundleText);
  if (addons.length === 0) {
    // A bundle with no addons removes a stale directory rather than leaving one
    // from an earlier build behind.
    fs.rmSync(outDirectory, { recursive: true, force: true });
    console.log(`No Node addons in ${bundlePath}; removed ${outDirectory}.`);
    return { copied: [], out: outDirectory };
  }

  const missing = addons.filter(addon => !fs.existsSync(addon.path));
  if (missing.length > 0) {
    throw new Error(
      `collect-node-addons: the bundle names ${missing.length} addon file(s) ` +
        'that no longer exist. Rebuild the bundle before packaging:\n' +
        missing.map(addon => `  ${addon.key} -> ${addon.path}`).join('\n'),
    );
  }

  // Rebuilt from scratch so an addon that disappeared is not shipped.
  fs.rmSync(outDirectory, { recursive: true, force: true });
  const copied = [];
  for (const addon of addons) {
    const target = path.join(outDirectory, addon.key);
    if (!target.startsWith(outDirectory + path.sep)) {
      throw new Error(
        `collect-node-addons: key '${addon.key}' escapes ${outDirectory}`,
      );
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(addon.path, target);
    copied.push({ key: addon.key, path: addon.path, target });

    // Sibling shared libraries of the same directory, copied once per
    // directory so two addons in one folder do not copy them twice.
    for (const sibling of fs.readdirSync(path.dirname(addon.path))) {
      if (sibling === path.basename(addon.path)) continue;
      if (!isSiblingSharedLibrary(sibling, platform)) continue;
      const source = path.join(path.dirname(addon.path), sibling);
      if (!fs.statSync(source).isFile()) continue;
      const siblingKey = path.join(path.dirname(addon.key), sibling);
      const siblingTarget = path.join(outDirectory, siblingKey);
      if (!siblingTarget.startsWith(outDirectory + path.sep)) continue;
      if (fs.existsSync(siblingTarget)) continue;
      fs.mkdirSync(path.dirname(siblingTarget), { recursive: true });
      fs.copyFileSync(source, siblingTarget);
      copied.push({ key: siblingKey, path: source, target: siblingTarget });
    }
  }

  for (const entry of copied) {
    console.log(`  ${entry.key}  <-  ${entry.path}`);
  }
  console.log(
    `Copied ${addons.length} Node addon(s) and ${copied.length - addons.length} sibling librar(ies) to ${outDirectory}.`,
  );
  return { copied, out: outDirectory };
}
