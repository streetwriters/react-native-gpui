import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyPatchBlock,
  managedPatchEntries,
} from '../../../packages/cli/src/autolink.js';
import {
  cargoBuildRecording,
  cargoTargetDirectory,
  pruneTarget,
  targetGcEnabled,
  targetGcMaxAgeDays,
} from '../../../packages/cli/src/target-gc.js';
import { fileURLToPath } from 'node:url';

/**
 * Directories under `root` that contain a shared library with one of
 * `extensions`. The CMake tree is multi-config on Windows (Visual Studio), so
 * the built JSI library sits in a per-config subdirectory whose name depends on
 * the Cargo profile; on macOS and Linux it differs between the Debug and
 * Release trees as well. Collecting the directories that really hold a library
 * is more robust than naming the configuration, and the loader ignores the ones
 * that do not matter.
 */
function findLibraryDirectories(root, extensions) {
  const found = [];
  const walk = (directory, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (
      entries.some(
        entry =>
          entry.isFile() &&
          extensions.some(extension => entry.name.endsWith(extension)),
      )
    ) {
      found.push(directory);
    }
    for (const entry of entries) {
      if (entry.isDirectory())
        walk(path.join(directory, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/**
 * Directories where the shared JSI library can be, named without scanning.
 *
 * The scan below runs before `cargo test`, and on a fresh checkout neither the
 * CMake tree nor the prebuilt runtime exists yet: cargo creates both while it
 * builds the test binaries, so a scan finds nothing and the loader never gets
 * the directory. These candidates cover every name `build.rs` can choose —
 * `Debug`/`Release` from the Cargo profile, each suffixed `-prebuilt` when the
 * pinned runtime is in use — plus the versioned directory the runtime is
 * downloaded into. A loader ignores a candidate that does not exist, so naming
 * them all is safe and does not depend on build order.
 */
function cmakeLibraryCandidates(targetTriple) {
  const root = path.join(
    metadata.target_directory,
    'rn-gpui-cmake',
    targetTriple,
  );
  return ['Debug', 'Release', 'Debug-prebuilt', 'Release-prebuilt'].map(
    configuration =>
      path.join(root, configuration, 'build', 'ReactCommon', 'jsi'),
  );
}

/**
 * The directory the pinned prebuilt runtime is unpacked into, including its
 * version, so the candidate is right on the first run rather than only after a
 * download has populated the cache.
 */
function prebuiltLibraryCandidates() {
  const [hostOs, arch] = [
    { darwin: 'darwin', linux: 'linux', win32: 'win32' }[process.platform],
    process.arch === 'arm64' ? 'arm64' : 'x64',
  ];
  if (!hostOs) return [];
  let version;
  try {
    version = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'packages/core/prebuilt-binaries.json'),
        'utf8',
      ),
    ).version;
  } catch {
    return [];
  }
  if (!version) return [];
  // Shared libraries ship in `bin/` (jsi.dll, libjsi.dylib) and static ones in
  // `lib/`; Windows has no rpath, so a cold run finds jsi.dll only through here.
  const platformDir = path.join(
    prebuiltCacheRoot(),
    version,
    `${hostOs}-${arch}`,
  );
  return [path.join(platformDir, 'bin'), path.join(platformDir, 'lib')];
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

/**
 * The root that holds the downloaded prebuilt runtime, `<root>/<version>/<platform>`,
 * matching `cacheRoot()` in packages/core/scripts/prebuilt-binaries.mjs. The
 * environment override wins there too, so a CI job that caches the download
 * under `$RUNNER_TEMP` is honoured here rather than only in the build.
 */
function prebuiltCacheRoot() {
  if (process.env.RN_GPUI_PREBUILT_CACHE) {
    return path.resolve(process.env.RN_GPUI_PREBUILT_CACHE);
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Caches',
      'react-native-gpui',
      'prebuilt',
    );
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'react-native-gpui',
      'prebuilt',
    );
  }
  return path.join(
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'),
    'react-native-gpui',
    'prebuilt',
  );
}
const cargoManifest = path.join(repoRoot, 'packages/core/ReactGpui/Cargo.toml');
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--manifest-path',
      cargoManifest,
      '--no-deps',
      '--format-version',
      '1',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  ),
);
const env = { ...process.env };

/**
 * The tester's autolinked C++ lives in `packages/rn-gpui-tester/desktop`, and
 * cargo learns about it from that directory's `.cargo/config.toml` `[env]`
 * section. Those variables only apply when cargo is invoked *from* that
 * directory, and this script runs from the repository root against
 * `ReactGpui/Cargo.toml`, so without them the CMake configure finds no app
 * provider.
 *
 * Windows only. There the reference is hard: MSVC has no weak symbols, so a
 * `rn-gpui-sys` test binary that links this crate alone cannot resolve the
 * app-provider symbol and the link fails (that is what commit `fee8910` fixed,
 * together with an `alternatename` fallback). macOS and Linux get a weak
 * reference, so the same binaries link with no autolink list at all — which is
 * how they passed 94 tests before this was added. Setting the variables there
 * would silently change what CMake configures, which is a difference this plan
 * is trying to remove rather than add.
 */
function setAutolinkEnv(targetEnv) {
  if (process.platform !== 'win32') {
    return;
  }
  const desktopRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'desktop',
  );
  const variables = {
    RN_GPUI_AUTOLINK_MANIFEST: path.join(desktopRoot, 'autolink/autolink.json'),
    RN_GPUI_AUTOLINK_CMAKE: path.join(desktopRoot, 'autolink/autolink.cmake'),
  };
  for (const [name, value] of Object.entries(variables)) {
    if (targetEnv[name] === undefined && fs.existsSync(value)) {
      targetEnv[name] = value;
    }
  }
}
setAutolinkEnv(env);

if (process.platform === 'darwin') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  // The engine lives in its own package; the JSI dylib comes from the CMake
  // tree or, in prebuilt mode, from the pinned runtime. Both are named ahead of
  // the build (see cmakeLibraryCandidates) *and* scanned, so a warm tree whose
  // configuration is not in the list is still found.
  const runtimeDirs = [
    path.join(repoRoot, 'packages/hermes/bin', hermesArch),
    ...cmakeLibraryCandidates(targetTriple),
    ...prebuiltLibraryCandidates(),
    ...findLibraryDirectories(
      path.join(metadata.target_directory, 'rn-gpui-cmake', targetTriple),
      ['.dylib'],
    ),
    ...findLibraryDirectories(prebuiltCacheRoot(), ['.dylib']),
  ];
  env.DYLD_LIBRARY_PATH = [...runtimeDirs, env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter);
} else if (process.platform === 'win32') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  // Windows has no loader search path variable: a DLL is found through PATH, or
  // next to the executable, and the test binaries live in `<target>/debug/deps`.
  // The engine ships in the package; the JSI DLL comes from the CMake tree or,
  // in prebuilt mode, from the downloaded runtime. Those are named ahead of the
  // build as well as scanned, because on a fresh checkout neither exists until
  // cargo creates it.
  const runtimeDirs = [
    path.join(repoRoot, 'packages/hermes/bin', hermesArch),
    ...cmakeLibraryCandidates(targetTriple),
    ...prebuiltLibraryCandidates(),
    ...findLibraryDirectories(
      path.join(metadata.target_directory, 'rn-gpui-cmake', targetTriple),
      ['.dll'],
    ),
    // Prebuilt mode keeps the shared engine and JSI DLLs in the downloaded
    // runtime rather than the CMake tree.
    ...findLibraryDirectories(prebuiltCacheRoot(), ['.dll']),
  ];
  prependToPathVariable(env, 'PATH', runtimeDirs);
} else if (process.platform === 'linux') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  // The sys test binaries link the shared JSI library and the engine. The JSI
  // library comes from the CMake tree or, in prebuilt mode, from the pinned
  // runtime; the candidates are named ahead of the build because a fresh
  // checkout has neither until cargo creates it.
  const runtimeDirs = [
    path.join(repoRoot, 'packages/hermes/bin', hermesArch),
    ...cmakeLibraryCandidates(targetTriple),
    ...prebuiltLibraryCandidates(),
    ...findLibraryDirectories(
      path.join(metadata.target_directory, 'rn-gpui-cmake', targetTriple),
      ['.so'],
    ),
    ...findLibraryDirectories(prebuiltCacheRoot(), ['.so']),
  ];
  env.LD_LIBRARY_PATH = [...runtimeDirs, env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter);
}

/**
 * Prepends `directories` to a `PATH`-like variable. Windows exports the
 * variable as `Path`, and `{...process.env}` keeps that spelling, so writing
 * `env.PATH` would add a second key: the child then gets both and Node keeps
 * only one of them, which drops `cargo` off the search path entirely
 * (`spawnSync cargo ENOENT`). The existing key is therefore found
 * case-insensitively and reused.
 */
function prependToPathVariable(target, name, directories) {
  const key =
    Object.keys(target).find(
      candidate => candidate.toLowerCase() === name.toLowerCase(),
    ) ?? name;
  target[key] = [...directories, target[key]]
    .filter(Boolean)
    .join(path.delimiter);
  return key;
}

const coreTestArgs = [
  'test',
  '--manifest-path',
  cargoManifest,
  '--workspace',
  '--features',
  'react-native-gpui/test-driver',
  // A test name or filter, as `cargo test` takes it: `npm run test:rust -- tray`.
  // It narrows the core run only; the module crates' tests below always run whole.
  ...process.argv.slice(2),
];
// The same collection an app build gets from the CLI: drop what no build has
// used for a week, then build the tests while recording what they use, so the
// collector knows the test units are live and leaves them alone. The test run
// after it finds everything fresh.
if (targetGcEnabled()) {
  const targetDir = cargoTargetDirectory(cargoManifest, { cwd: repoRoot, env });
  if (targetDir) pruneTarget(targetDir, { maxAgeDays: targetGcMaxAgeDays() });
  await cargoBuildRecording([...coreTestArgs, '--no-run'], {
    cwd: repoRoot,
    env,
    targetDir,
  });
}
const result = spawnSync('cargo', coreTestArgs, {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});
if (result.error) throw result.error;

// The module crates' own tests. They cannot run from their own directories: a
// module depends on core by version requirement, and only the app's manifest
// carries the `[patch.crates-io]` table that points it at the installed core, so
// `cargo test` has to be rooted at the tester.
//
// Only `rn-gpui-fs` is listed. The other two module crates cannot be tested
// from here, for reasons that predate this script and are not fixable by adding
// them to it:
//
// - `rn-gpui-svg` links `libjsi.dylib` from the C++ runtime, and the module has
//   no build script to put that library on its test binary's rpath, so it aborts
//   in dyld before running a test.
// - `rn-gpui-screens` needs core's `test-driver` feature for `TestNode`. A
//   dev-dependency is the only way to request it, and Cargo refuses to test a
//   package that has dev-dependencies unless it is a workspace member — which a
//   module crate, by design, is not. `--features` is refused for the same
//   reason.
//
// Both need their own fix. Listing either here would only make this script fail
// for a reason it cannot address.
// The module crates' own tests. They cannot run from their own directories: a
// module depends on core by version requirement, and only the app's manifest
// carries the `[patch.crates-io]` table that points it at the installed core, so
// `cargo test` has to be rooted at the tester.
//
// The crates are read from autolink's record rather than listed here, so a new
// module's tests run without editing this script.
const autolinkRecord = path.join(
  repoRoot,
  'packages/rn-gpui-tester/desktop/autolink/autolink.json',
);
if (!fs.existsSync(autolinkRecord)) {
  throw new Error(
    `${autolinkRecord} is missing; run \`npm run autolink\` in packages/rn-gpui-tester first`,
  );
}
const record = JSON.parse(fs.readFileSync(autolinkRecord, 'utf8'));

/// Crates whose tests cannot run yet, each with the reason. Printed on every run
/// so the gap stays visible rather than being quietly forgotten.
// Each was blocked, and neither blocks any more:
//
// - `rn-gpui-svg` and `rn-gpui-screens` both link `libjsi.dylib` from the C++
//   runtime, which their test binaries could not find, so they aborted in dyld
//   before running a test. Each now has a `build.rs` that puts core's rpath
//   directories on its own test binary.
// - `rn-gpui-screens` additionally needs core's `test-driver` feature for
//   `TestNode`. It declares a dev-dependency for that and a `[workspace]` of its
//   own, because Cargo refuses to test a package with dev-dependencies unless it
//   is a workspace member — and core's workspace cannot hold it, since a module
//   resolves core by version.
const SKIPPED = new Map();

const moduleCrates = (record.rustCrates ?? [])
  .filter(crate => {
    const resolved = path.resolve(crate.cargoPath ?? '');
    return resolved.startsWith(path.join(repoRoot, 'modules') + path.sep);
  })
  .map(crate => crate.crateName)
  .filter(name => typeof name === 'string')
  .sort();

// A crate that declares a `[workspace]` of its own is tested from its own
// directory, and has to be: Cargo refuses to test a package with dev-dependencies
// unless it is a workspace member, and from the tester's manifest it is not one.
// Such a crate is its own root, so it carries the patch block that points core at
// this checkout; the block is checked in beside the crate.
const isOwnWorkspace = name => {
  const entry = (record.rustCrates ?? []).find(
    crate => crate.crateName === name,
  );
  const manifest = path.join(
    path.resolve(entry?.cargoPath ?? ''),
    'Cargo.toml',
  );
  return (
    fs.existsSync(manifest) &&
    /^\[workspace\]/mu.test(fs.readFileSync(manifest, 'utf8'))
  );
};

const ownWorkspace = moduleCrates.filter(
  name => !SKIPPED.has(name) && isOwnWorkspace(name),
);
const fromTester = moduleCrates.filter(
  name => !SKIPPED.has(name) && !isOwnWorkspace(name),
);
const toRun = [...fromTester, ...ownWorkspace];
process.stderr.write(
  `module crates: ${toRun.length > 0 ? toRun.join(', ') : 'none'}\n`,
);
for (const name of moduleCrates.filter(candidate => SKIPPED.has(candidate))) {
  process.stderr.write(`skipped ${name}: ${SKIPPED.get(name)}\n`);
}

const moduleRuns = [];
if (fromTester.length > 0) {
  const args = [
    'test',
    '--manifest-path',
    'packages/rn-gpui-tester/desktop/Cargo.toml',
  ];
  for (const name of fromTester) args.push('-p', name);
  moduleRuns.push(
    spawnSync('cargo', args, { cwd: repoRoot, env, stdio: 'inherit' }),
  );
}
// A crate that is its own workspace root needs the `[patch.crates-io]` table in
// its own manifest, because Cargo honours `[patch]` only at the root and this
// crate is not a member of the app's workspace. The block is generated here from
// core's manifest rather than checked in: checked in, it would pin gpui at
// whatever revision happened to be current when it was written, and the module's
// tests would quietly build against an older gpui than the app ships — the drift
// this branch exists to remove.
for (const name of ownWorkspace) {
  const entry = (record.rustCrates ?? []).find(
    crate => crate.crateName === name,
  );
  const crateRoot = path.resolve(entry.cargoPath);
  const manifestPath = path.join(crateRoot, 'Cargo.toml');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  // The file is committed with LF, and a Windows checkout with `core.autocrlf`
  // reads back CRLF. Compared without normalising, every Windows run would report
  // the block stale and rewrite a file whose content is already correct — the
  // same mistake autolink's own readers were fixed for.
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const before = raw.replace(/\r\n/gu, '\n');
  const updated = applyPatchBlock(
    before,
    manifestPath,
    managedPatchEntries(path.join(repoRoot, 'packages/core'), crateRoot),
  );
  if (updated !== before) {
    // Written and then failed: a stale block is a mistake that should be
    // corrected in the same commit as whichever pin change caused it, not
    // silently repaired on every test run. The file's own newline convention is
    // restored, so a Windows checkout is not rewritten with LF.
    fs.writeFileSync(
      manifestPath,
      newline === '\r\n' ? updated.replace(/\n/gu, '\r\n') : updated,
    );
    throw new Error(
      `${manifestPath} had a stale [patch.crates-io] block and has been rewritten. ` +
        "Commit the result: it must match core's gpui pin.",
    );
  }
}

for (const name of ownWorkspace) {
  const entry = (record.rustCrates ?? []).find(
    crate => crate.crateName === name,
  );
  moduleRuns.push(
    spawnSync('cargo', ['test'], {
      cwd: path.resolve(entry.cargoPath),
      env,
      stdio: 'inherit',
    }),
  );
}
for (const run of moduleRuns) {
  if (run.error) throw run.error;
}

// Every run must pass, and `??` is the wrong operator to say so: a passing run
// reports status 0, which is not nullish, so `0 ?? failure` is 0 and a failing
// later run would go unnoticed. `status` is null when a run was killed by a
// signal, which counts as a failure rather than as nothing to report.
const exitStatus = run => run.status ?? 1;
process.exitCode = [result, ...moduleRuns].reduce(
  (worst, run) => worst || exitStatus(run),
  0,
);
