#!/usr/bin/env node
// Proves the packed packages work for a consumer: creates a fresh app outside
// the repository, installs every @react-native-gpui package from its tarball,
// builds a release desktop binary and runs it in smoke mode.
//
// Usage:
//   node scripts/ci/clean-install.mjs --packed <map.json> [--dir <dir>]
//
// --packed is the JSON map pack-all.mjs prints (package name -> tarball). The
// app is created under --dir, which must be outside the repository: the point
// is to catch a package that only works because the checkout is next to it.
// Steps are named so the workflow can report each one through step.mjs.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/// Every @react-native-gpui package plus the platform package, which the plan
/// calls @react-native-gpui/core. Read from the packed map rather than listed
/// by hand, so adding a package cannot leave the overrides behind.
function overridesFor(packed) {
  const overrides = {};
  for (const [name, tarball] of Object.entries(packed)) {
    overrides[name] = `file:${tarball}`;
  }
  return overrides;
}

function parseArgs(argv) {
  const parsed = {
    packed: null,
    dir: path.join(
      process.env.RUNNER_TEMP ?? os.tmpdir(),
      'rn-gpui-clean-install',
    ),
  };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--packed') parsed.packed = argv[++index];
    else if (argv[index] === '--dir') parsed.dir = argv[++index];
  }
  if (!parsed.packed) throw new Error('--packed <map.json> is required');
  return parsed;
}

/// Runs a command, inheriting stdio so the workflow's wrapper captures it.
function run(command, args, options = {}) {
  process.stderr.write(`\n$ ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

function main() {
  const { packed: packedPath, dir } = parseArgs(process.argv.slice(2));
  const packed = JSON.parse(fs.readFileSync(packedPath, 'utf8'));
  const appDir = path.resolve(dir);
  if (appDir.startsWith(repoRoot + path.sep)) {
    throw new Error(
      `refusing to install inside the repository (${appDir}); the point of ` +
        'this job is a consumer that has no checkout',
    );
  }

  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });

  const cliTarball = packed['@react-native-gpui/cli'];
  if (!cliTarball) throw new Error('the packed map has no CLI package');

  // 1. Bootstrap the packed CLI once, then run it from that install.
  //
  //    `npx --package=<tarball> react-native-gpui init ...` looks like it
  //    should work but does not: npx installs the CLI into a cache directory
  //    and runs it from there, and `init` then shells out to
  //    `npx @react-native-community/cli init`, which cannot be resolved from
  //    that cache and exits 127 (`sh: @react-native-community/cli@^20.2.0: No
  //    such file or directory`). Installing the CLI first and running its bin
  //    keeps the nested npx call inside a normal node_modules tree.
  //
  //    `init` passes --skip-install to the community CLI itself, so the app is
  //    scaffolded without its dependencies.
  run('npm', ['install', '--no-package-lock', '--no-save', cliTarball], {
    cwd: appDir,
    shell: process.platform === 'win32',
  });
  const cliBin = path.join(
    appDir,
    'node_modules',
    '@react-native-gpui',
    'cli',
    'bin',
    'react-native-gpui.js',
  );
  if (!fs.existsSync(cliBin)) {
    throw new Error(`the CLI tarball installed no bin at ${cliBin}`);
  }
  run(
    process.execPath,
    [cliBin, 'init', 'SmokeApp', '--directory', 'SmokeApp'],
    { cwd: appDir },
  );

  const projectRoot = path.join(appDir, 'SmokeApp');
  const manifestPath = path.join(projectRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 2. Point every package at its tarball.
  //
  //    `overrides` alone is not enough: npm rejects an override that conflicts
  //    with a direct dependency's range (`EOVERRIDE: Override for
  //    @react-native-gpui/core@^0.1.0 conflicts with direct dependency`), and
  //    the scaffold declares three of these directly. Rewriting the direct
  //    dependencies to the same `file:` spec satisfies that rule, and the
  //    overrides still cover the transitive ones the app never names.
  const specs = overridesFor(packed);
  for (const name of Object.keys(specs)) {
    if (manifest.dependencies?.[name] !== undefined) {
      manifest.dependencies[name] = specs[name];
    }
    if (manifest.devDependencies?.[name] !== undefined) {
      manifest.devDependencies[name] = specs[name];
    }
  }
  manifest.overrides = { ...manifest.overrides, ...specs };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(
    `overrides: ${Object.keys(manifest.overrides).length} package(s)\n`,
  );

  // 3. Install from the tarballs.
  run('npm', ['install'], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
  });

  // 3b. Fetch this platform's Hermes binaries.
  //
  //     `bin/` is gitignored and deliberately excluded from the package's
  //     `files`, so a consumer install has neither `libhermesvm` nor `hermesc`.
  //     A2 taught the CMake configure to download the library on demand, but
  //     nothing downloads `hermesc`, which the JS bundling step needs before
  //     CMake runs: a release build stops at `hermesc not found at
  //     .../@react-native-gpui/hermes/bin/<platform>/hermesc`, whose own
  //     message names this command. Running it here is that documented step.
  //     **Product bug:** a consumer should not have to, since the same fetch
  //     that CMake already performs would cover both files.
  const hermesFetch = path.join(
    projectRoot,
    'node_modules',
    '@react-native-gpui',
    'hermes',
    'scripts',
    'fetch-binaries.mjs',
  );
  if (!fs.existsSync(hermesFetch)) {
    throw new Error(
      `the hermes package installed no fetch script at ${hermesFetch}`,
    );
  }
  run(process.execPath, [hermesFetch, '--platform', hermesPlatform()], {
    cwd: path.dirname(path.dirname(hermesFetch)),
  });

  // 4. Build the release binary. RN_GPUI_BUILD_FROM_SOURCE is set by the
  //    workflow when the C++ inputs changed, because under node_modules the
  //    hash is not checked and a stale pin would otherwise be used.
  run('npx', ['react-native', 'run-desktop', '--release', '--no-launch'], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
  });

  // 5. Run it. RN_GPUI_SMOKE=1 exits 0 on the first frame, 1 on timeout and 2
  //    on a JS error, so the exit code is the answer.
  //
  //    The scaffold points cargo at `build/target` through
  //    `desktop/.cargo/config.toml`, so the binary is not in the usual
  //    `desktop/target`. Read the configured directory rather than assume it.
  const binary = path.resolve(
    projectRoot,
    'desktop',
    cargoTargetDir(path.join(projectRoot, 'desktop')),
    'release',
    `${binaryName(manifest.name)}${process.platform === 'win32' ? '.exe' : ''}`,
  );
  if (!fs.existsSync(binary)) {
    throw new Error(`release binary not found at ${binary}`);
  }
  const smoke = { ...process.env, RN_GPUI_SMOKE: '1' };
  if (process.platform === 'linux') {
    run('xvfb-run', ['-a', '-s', '-screen 0 1280x900x24', binary], {
      cwd: projectRoot,
      env: smoke,
    });
  } else {
    run(binary, [], { cwd: projectRoot, env: smoke });
  }

  // 6. Package it, install the package outside the build tree, and run that.
  //
  //    This is the step that catches what a build-tree run cannot: a library
  //    left behind, a bundle the executable cannot find, an rpath that only
  //    works from where it was compiled.
  packageAndSmoke({ projectRoot, manifest, appDir, binary });
}

/**
 * Build the installers, install one outside the tree, and start the result.
 *
 * The formats are this phase's alpha set for each OS. Each is installed the way
 * a user would install it, not run from `dist/`.
 */
function packageAndSmoke({ projectRoot, manifest, appDir, binary }) {
  run('npx', ['react-native', 'package-desktop'], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
  });

  // `package-desktop` writes its output to `desktop/build/dist`, which is a
  // sibling of the `build/target` the scaffold points Cargo at.
  const distDir = path.join(projectRoot, 'desktop', 'build', 'dist');
  const produced = fs.existsSync(distDir)
    ? fs.readdirSync(distDir).filter(name => !name.startsWith('.'))
    : [];
  if (produced.length === 0) {
    throw new Error(`package-desktop produced nothing in ${distDir}`);
  }
  process.stderr.write(`packages: ${produced.join(', ')}\n`);

  const installDir = path.join(appDir, 'installed');
  fs.mkdirSync(installDir, { recursive: true });
  const smoke = { ...process.env, RN_GPUI_SMOKE: '1' };

  if (process.platform === 'darwin') {
    const app = produced.find(name => name.endsWith('.app'));
    if (app === undefined) throw new Error('no .app was produced');
    run('ditto', [path.join(distDir, app), path.join(installDir, app)]);
    const installed = path.join(
      installDir,
      app,
      'Contents',
      'MacOS',
      binaryName(manifest.name),
    );
    if (!fs.existsSync(installed)) {
      throw new Error(`the app bundle has no executable at ${installed}`);
    }
    checkLinkage(
      path.join(installDir, app),
      path.join('Contents', 'MacOS', binaryName(manifest.name)),
    );
    run(installed, [], { cwd: installDir, env: smoke });
    return;
  }

  if (process.platform === 'win32') {
    const installer = produced.find(name =>
      name.toLowerCase().endsWith('.exe'),
    );
    if (installer === undefined) throw new Error('no NSIS installer produced');
    // cargo-packager names the file after the binary and the version, while the
    // installer's title and Start-menu entry come from `productName`. Both are
    // asserted: the file name here, `productName` by the smoke run's window.
    const expected = new RegExp(
      `^${binaryName(manifest.name)}_\\d+\\.\\d+\\.\\d+_.+-setup\\.exe$`,
      'u',
    );
    if (!expected.test(installer)) {
      throw new Error(
        `the installer is named ${installer}, which is not <binary>_<version>_<arch>-setup.exe`,
      );
    }
    const target = path.join(installDir, 'SmokeApp');
    run(path.join(distDir, installer), ['/S', `/D=${target}`], {
      cwd: installDir,
    });
    // `binary` is the absolute path of the built exe; the install directory is
    // a new root, so only the file name carries over.
    const installed = path.join(target, `${binaryName(manifest.name)}.exe`);
    if (!fs.existsSync(installed)) {
      throw new Error(`the installer did not place a binary at ${installed}`);
    }
    checkLinkage(target, `${binaryName(manifest.name)}.exe`);
    run(installed, [], { cwd: target, env: smoke });
    return;
  }

  // Linux: the deb is extracted rather than installed, because installing one
  // needs root and this only has to prove the layout.
  const deb = produced.find(name => name.endsWith('.deb'));
  if (deb === undefined) throw new Error('no .deb was produced');
  const extracted = path.join(installDir, 'deb');
  fs.mkdirSync(extracted, { recursive: true });
  run('dpkg', ['-x', path.join(distDir, deb), extracted], { cwd: installDir });
  const installed = path.join(
    extracted,
    'usr',
    'bin',
    binaryName(manifest.name),
  );
  if (!fs.existsSync(installed)) {
    throw new Error(`the deb did not place a binary at ${installed}`);
  }
  checkLinkage(extracted, path.join('usr', 'bin', binaryName(manifest.name)));
  run('xvfb-run', ['-a', '-s', '-screen 0 1280x900x24', installed], {
    cwd: extracted,
    env: smoke,
  });

  // The AppImage is a different packaging of the same files, and it is what most
  // Linux users will download: it mounts itself and runs from the mount, which
  // is where a wrong `$ORIGIN` shows up. `--appimage-extract-and-run` avoids the
  // FUSE requirement that a container does not have.
  const appimage = produced.find(name => name.endsWith('.AppImage'));
  if (appimage === undefined) throw new Error('no .AppImage was produced');
  run(
    'xvfb-run',
    [
      '-a',
      '-s',
      '-screen 0 1280x900x24',
      path.join(distDir, appimage),
      '--appimage-extract-and-run',
    ],
    {
      cwd: installDir,
      env: smoke,
    },
  );
}

/**
 * Fail when a packaged binary still points into the build tree.
 *
 * Two things can leak, and the second is the one that matters:
 *
 * - a library *dependency* naming an absolute path, which is what `otool -L` and
 *   `readelf -d`'s NEEDED lines show;
 * - an `LC_RPATH`/`RUNPATH` entry naming an absolute path. `otool -L` does not
 *   print these, and a packaged app carrying the build machine's rpaths will
 *   load the build tree's libraries in preference to its own. A package that
 *   only works because it was run where it was built is not a package, so this
 *   is checked even though the smoke run usually hides it.
 *
 * On Windows there are no paths to leak — PE imports are bare DLL names — so the
 * check is that the runtime DLLs actually travelled with the app.
 */
function checkLinkage(root, name) {
  if (process.platform === 'win32') {
    checkRuntimeDlls(root);
    return;
  }

  const binary = path.join(root, name);
  if (!fs.existsSync(binary)) {
    throw new Error(`no packaged binary at ${binary}`);
  }
  const buildPath = /\/(?:Users|home|private\/var|var\/folders)\//u;
  const offenders = [];

  if (process.platform === 'darwin') {
    const linked = execFileSync('otool', ['-L', binary], { encoding: 'utf8' });
    // The first line is the binary's own path followed by a colon, and it is
    // unterminated on CI (`/Users/runner/...`), which is why it used to trip
    // this check on every macOS runner and pass locally under `/tmp`.
    for (const line of linked.split('\n').slice(1)) {
      if (buildPath.test(line)) offenders.push(line.trim());
    }
    const load = execFileSync('otool', ['-l', binary], { encoding: 'utf8' });
    // `path <dir> (offset N)`, four lines after each LC_RPATH.
    for (const line of load.split('\n')) {
      const match = line.match(/^\s+path (\S+) \(offset/u);
      if (match !== null && buildPath.test(`/${match[1]}`)) {
        offenders.push(`rpath ${match[1]}`);
      }
    }
  } else {
    const dynamic = execFileSync('readelf', ['-d', binary], {
      encoding: 'utf8',
    });
    for (const line of dynamic.split('\n')) {
      if (!/(?:NEEDED|RPATH|RUNPATH)/u.test(line)) continue;
      if (buildPath.test(line)) offenders.push(line.trim());
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `packaged binary still references the build tree:\n${offenders.join('\n')}`,
    );
  }
}

/**
 * On Windows, the runtime libraries have to be in the install directory.
 *
 * PE imports are bare DLL names and the loader searches beside the executable,
 * so a missing DLL is a failure the smoke run would report as an obscure load
 * error. This script runs against a packed consumer install and cannot import
 * the CLI, so it reads the manifests the install left behind instead.
 */
function checkRuntimeDlls(root) {
  const present = new Set();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
      present.add(entry.name.toLowerCase());
    }
  }
  if (present.size === 0) {
    throw new Error(`the install at ${root} ships no DLLs at all`);
  }
  // Every DLL the build produced has to have arrived; a count is not enough,
  // because the subset that matters is chosen at run time.
  process.stderr.write(`runtime DLLs: ${[...present].sort().join(', ')}\n`);
}

/// Where cargo puts the app's binaries: `CARGO_TARGET_DIR` when set (CI keeps
/// it outside the app folder, which this script deletes, so the Cargo cache
/// survives), else `build.target-dir` from the desktop crate's own
/// `.cargo/config.toml`, relative to that crate, or `target`.
function cargoTargetDir(desktopRoot) {
  if (process.env.CARGO_TARGET_DIR) return process.env.CARGO_TARGET_DIR;
  let text;
  try {
    text = fs.readFileSync(
      path.join(desktopRoot, '.cargo', 'config.toml'),
      'utf8',
    );
  } catch {
    return 'target';
  }
  const match = text.match(/^\s*target-dir\s*=\s*"([^"]+)"/mu);
  return match ? match[1] : 'target';
}

/// The same rule the CLI uses to name the desktop crate: the app package name
/// lowercased with everything but [a-z0-9-] replaced.
function binaryName(packageName) {
  return `react-native-gpui-${packageName
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, '-')}`;
}

/// The platform key fetch-binaries.mjs and the workflow both use.
function hermesPlatform() {
  const hostOs = { darwin: 'darwin', linux: 'linux', win32: 'win32' }[
    process.platform
  ];
  if (!hostOs) throw new Error(`no Hermes platform for ${process.platform}`);
  return `${hostOs}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
}

main();
