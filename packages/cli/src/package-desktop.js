/**
 * The libraries and files a packaged app has to ship.
 *
 * A packaged app is copied to a machine that has no build tree, so every shared
 * library the executable links at run time has to travel with it: the engine,
 * the prebuilt runtime and anything a module built as a shared library. The list
 * is read from what autolink recorded and from the build output, never from a
 * hard-coded table, so a module that adds a library is shipped without anyone
 * updating this file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// The engine's `runtimeFiles` is a CommonJS module inside the engine package, so
// it is loaded with a require rooted at this file rather than imported.
const require = createRequire(import.meta.url);

/** Where an app's autolink manifest lives. */
export function autolinkManifestPath(projectRoot) {
  return path.join(projectRoot, 'desktop', 'autolink', 'autolink.json');
}

/** The shared-library extension for an OS, or `undefined` for another OS. */
export function libraryExtension(os) {
  switch (os) {
    case 'macos':
      return '.dylib';
    case 'windows':
      return '.dll';
    case 'linux':
      return '.so';
    default:
      return undefined;
  }
}

/**
 * Whether a file name is a shared library a packaged app must ship.
 *
 * Versioned Linux libraries (`libfoo.so.1`) count: the loader asks for the
 * versioned name, and shipping only the `libfoo.so` symlink ships nothing.
 */
function isSharedLibrary(name, extension) {
  if (extension === undefined) return false;
  if (name.endsWith(extension)) return true;
  return extension === '.so' && /\.so(\.\d+)+$/u.test(name);
}

/** The files in `directory` that are shared libraries, sorted. */
function sharedLibrariesIn(directory, extension) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile() && isSharedLibrary(entry.name, extension))
    .map(entry => path.join(directory, entry.name))
    .sort();
}

/**
 * Every runtime library a packaged app must carry.
 *
 * `os` and `arch` are the ones being packaged — Node's `process.platform` and
 * `process.arch` spellings — so this is testable without packaging anything.
 *
 * Returns absolute paths, de-duplicated and sorted. A missing autolink manifest
 * is an empty list rather than an error: an app with no autolinked modules has
 * nothing extra to ship.
 */
export function runtimeLibraries(
  projectRoot,
  { os, arch, release = true } = {},
) {
  const platform = os ?? process.platform;
  const architecture = arch ?? process.arch;
  const extension = libraryExtension(
    platform === 'darwin'
      ? 'macos'
      : platform === 'win32'
        ? 'windows'
        : 'linux',
  );
  const libraries = new Set();

  const manifest = readManifest(autolinkManifestPath(projectRoot));
  if (manifest !== undefined) {
    // The engine names its own files, because only it knows what its platform
    // build produces (a dylib, a DLL, and on some builds extra archives).
    for (const engine of manifest.jsEngines ?? []) {
      if (typeof engine.runtimeFiles !== 'string' || !engine.runtimeFiles) {
        continue;
      }
      let files;
      try {
        const resolve = require(engine.runtimeFiles);
        files = resolve(platform, architecture) ?? [];
      } catch {
        continue;
      }
      for (const file of files) {
        if (isSharedLibrary(path.basename(file), extension)) {
          libraries.add(path.resolve(file));
        }
      }
    }
  }

  // Libraries the build produced. The runtime's own dependencies land beside
  // the crate that built them, so every candidate directory is scanned rather
  // than a single assumed one.
  for (const directory of buildLibraryDirectories(projectRoot, { release })) {
    for (const file of sharedLibrariesIn(directory, extension)) {
      libraries.add(file);
    }
  }

  // Finally, and most reliably, ask the executable what it links. A library can
  // live outside both the profile directory and a crate's `out` — the C++
  // bridge's `libjsi` is built by CMake under its own tree — and only the
  // binary's own dependencies say what it needs at run time.
  for (const file of linkedSharedLibraries(projectRoot, {
    release,
    extension,
  })) {
    libraries.add(file);
  }

  return [...libraries].sort();
}

/**
 * The shared libraries an executable links that are not system libraries.
 *
 * `otool -L` on macOS, `readelf -d` on Linux. A system library resolves from the
 * OS and must not be bundled; anything resolved through a `@rpath` entry, or
 * living under the build, is ours to ship.
 */
export function linkedSharedLibraries(projectRoot, { release, extension }) {
  const binary = path.join(
    targetProfileDir(
      path.join(projectRoot, 'desktop'),
      release ? 'release' : 'debug',
    ),
    executableName(projectRoot),
  );
  if (!fs.existsSync(binary)) return [];

  let output;
  try {
    if (process.platform === 'darwin') {
      output = execFileSync('otool', ['-L', binary], { encoding: 'utf8' });
    } else if (process.platform === 'linux') {
      output = execFileSync('readelf', ['-d', binary], { encoding: 'utf8' });
    } else {
      return [];
    }
  } catch {
    return [];
  }

  const found = new Set();
  for (const reference of parseSharedLibraryReferences(
    output,
    process.platform,
  )) {
    const resolved = resolveLinkedLibrary(reference, {
      binary,
      projectRoot,
    });
    if (resolved === undefined) continue;
    if (isSharedLibrary(path.basename(resolved), extension))
      found.add(resolved);
  }
  return [...found];
}

/**
 * The library references in `otool -L` or `readelf -d` output.
 *
 * Pure, and separate from running the tool, because the two formats differ in
 * the way that matters most: a Mach-O dependency names a path (`@rpath/foo`,
 * `/abs/foo`), while an ELF `NEEDED` entry is a bare soname (`libjsi.so`) that
 * says nothing about where the file came from. That difference is invisible to
 * anyone developing on macOS, so it is tested against recorded output.
 */
export function parseSharedLibraryReferences(output, platform) {
  const references = [];
  for (const line of output.split('\n')) {
    // `otool -L`: an indented path, then the compatibility version in parens.
    // The first line is the binary's own path and must be ignored.
    const machO = platform === 'darwin' ? line.match(/^\t(\S+)\s+\(/u) : null;
    // `readelf -d`: `0x… (NEEDED)  Shared library: [libjsi.so]`.
    const elf = line.match(/NEEDED\)\s+Shared library: \[(\S+)\]/u);
    const match = machO ?? elf;
    if (match === null) continue;
    if (!references.includes(match[1])) references.push(match[1]);
  }
  return references;
}

/**
 * `resolveLinkedLibrary`, exposed for tests.
 *
 * The bare-soname case only happens on Linux, where these tests cannot run, so
 * the lookup has to be exercised from macOS against a synthesised build tree.
 */
export function resolveLinkedLibraryForTest(reference, projectRoot) {
  return resolveLinkedLibrary(reference, {
    binary: path.join(projectRoot, 'desktop', 'target', 'release', 'my-app'),
    projectRoot,
  });
}

/**
 * Where a `@rpath`/`$ORIGIN` reference actually points, or `None` for a system
 * library.
 *
 * The executable's own rpaths are what the loader uses, so they are what this
 * walks. A reference into `/usr/lib` is the OS's to provide.
 */
function resolveLinkedLibrary(reference, { binary, projectRoot }) {
  if (reference.startsWith('@rpath/')) {
    const name = reference.slice('@rpath/'.length);
    for (const rpath of rpathsOf(binary)) {
      const candidate = path.join(rpath, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    // A packaging build carries only relative rpaths, so the absolute library
    // directories are not in the file to be read back out. The CMake tree is
    // where the C++ runtime's own libraries live in that case.
    for (const directory of cmakeLibraryDirectories(projectRoot)) {
      const candidate = path.join(directory, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  if (reference.startsWith('$ORIGIN')) {
    const candidate = path.join(
      path.dirname(binary),
      reference.slice('$ORIGIN/'.length),
    );
    return fs.existsSync(candidate) ? candidate : undefined;
  }
  if (!path.isAbsolute(reference)) {
    // ELF `NEEDED` entries are bare sonames (`libjsi.so`), not paths, so a Linux
    // binary says nothing about where its libraries came from. Look for the name
    // in the directories the build produced; a system library will not be there
    // and is correctly skipped.
    for (const directory of [
      // The CMake tree first: that is where the C++ runtime's own libraries are
      // built, and a same-named file in some crate's `out` is not the one the
      // executable links.
      ...cmakeLibraryDirectories(projectRoot),
      ...buildLibraryDirectories(projectRoot, { release: true }),
    ]) {
      const candidate = path.join(directory, reference);
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  // A library under the repository belongs to the build; one under /usr or
  // /System belongs to the OS.
  if (reference.startsWith('/usr/') || reference.startsWith('/System/')) {
    return undefined;
  }
  return reference.startsWith(projectRoot) ? reference : undefined;
}

/** The rpaths a Mach-O binary carries, absolute entries only. */
function rpathsOf(binary) {
  let output;
  try {
    output = execFileSync('otool', ['-l', binary], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const out = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s+path (\S+) \(offset/u);
    if (match !== null && path.isAbsolute(match[1])) out.push(match[1]);
  }
  return out;
}

/**
 * Directories under the C++ build tree that hold its shared libraries.
 *
 * `libjsi` is built by CMake, not Cargo, so it is in neither the profile
 * directory nor a crate's `out`: it sits under
 * `<crate>/build/target/rn-gpui-cmake/<triple>/<config>/build/...`.
 */
function cmakeLibraryDirectories(projectRoot) {
  // The CMake tree sits beside the Cargo profile directory, so it moves with
  // `CARGO_TARGET_DIR`, which CI sets. Deriving it from the resolved target
  // directory is what makes this work in a clean install as well as in the repo.
  const root = path.join(
    path.dirname(
      targetProfileDir(path.join(projectRoot, 'desktop'), 'release'),
    ),
    'rn-gpui-cmake',
  );
  const found = [];
  let triples;
  try {
    triples = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const triple of triples) {
    if (!triple.isDirectory()) continue;
    const tripleDir = path.join(root, triple.name);
    for (const config of fs.readdirSync(tripleDir, { withFileTypes: true })) {
      if (!config.isDirectory()) continue;
      const configDir = path.join(tripleDir, config.name);
      // The libraries are at different depths per dependency, so walk.
      for (const entry of walkDirectories(configDir)) found.push(entry);
    }
  }
  return found;
}

/** Every directory at or below `root`, breadth-first, bounded in depth. */
function walkDirectories(root, depth = 0) {
  if (depth > 5) return [];
  const out = [root];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory())
      out.push(...walkDirectories(path.join(root, entry.name), depth + 1));
  }
  return out;
}

/** The executable's file name, from the desktop crate's Cargo.toml. */
function executableName(projectRoot) {
  try {
    const manifest = fs.readFileSync(
      path.join(projectRoot, 'desktop', 'Cargo.toml'),
      'utf8',
    );
    return manifest.match(/^name\s*=\s*"([^"]+)"/mu)?.[1] ?? '';
  } catch {
    return '';
  }
}

function readManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Directories the build may have put shared libraries in.
 *
 * Both the crate's own target directory and the one Cargo was pointed at
 * (`CARGO_TARGET_DIR`), because the CLI sets the latter for reproducible paths.
 */
export function buildLibraryDirectories(projectRoot, { release = true } = {}) {
  const profile = release ? 'release' : 'debug';
  const crateDir = path.join(projectRoot, 'desktop');
  // `targetProfileDir` already applies `CARGO_TARGET_DIR` and the crate's own
  // `target-dir`, so the other roots are only fallbacks for a library that
  // landed somewhere less predictable.
  const roots = [
    path.dirname(targetProfileDir(crateDir, profile)),
    path.join(crateDir, 'target'),
    path.join(projectRoot, 'target'),
  ].filter(Boolean);
  const directories = new Set();
  for (const root of roots) {
    directories.add(path.join(root, profile));
    // The prebuilt runtime's shared library is placed under the sys crate's
    // build output, which is keyed by a hash that is not predictable.
    const buildRoot = path.join(root, profile, 'build');
    let entries;
    try {
      entries = fs.readdirSync(buildRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      directories.add(path.join(buildRoot, entry.name, 'out'));
    }
  }
  return [...directories];
}

/// The cargo-packager version this CLI drives and installs.
///
/// Pinned so a config written for one version is not silently handed to another:
/// the translator emits this version's schema, and an installed copy that differs
/// is replaced.
export const CARGO_PACKAGER_VERSION = '0.11.8';

/**
 * Signing variables cargo-packager reads from the environment itself.
 *
 * Nothing here is ever written into a config file: the packager skips these
 * fields when parsing JSON precisely so a secret cannot be committed, and this
 * CLI passes its own environment through unchanged so setting one in the shell
 * or in CI is all a user does. They are listed so a test can assert their values
 * never reach the generated config.
 */
export const SIGNING_ENVIRONMENT = [
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_SIGNING_IDENTITY',
  'APPLE_PROVIDER_SHORT_NAME',
  'APPLE_TEAM_ID',
  'APPLE_ID',
  'APPLE_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_ISSUER',
  'APPLE_API_KEY_PATH',
  'WINDOWS_CERTIFICATE_THUMBPRINT',
  'WINDOWS_TIMESTAMP_SERVER_URL',
  'WINDOWS_TSP',
];

/** cargo-packager's name for each of this phase's formats. */
const PACKAGER_FORMAT = {
  app: 'app',
  dmg: 'dmg',
  nsis: 'nsis',
  deb: 'deb',
  appimage: 'appimage',
};

/**
 * Where Cargo put the executable for a profile.
 *
 * The desktop crate's `.cargo/config.toml` redirects `target-dir` to
 * `build/target`, so `target/release` does not exist. Reading the setting is the
 * only way to be right for both layouts.
 */
export function targetProfileDir(crateDir, profile) {
  // `CARGO_TARGET_DIR` overrides everything, and CI sets it so the build cache
  // survives a deleted app folder.
  if (process.env.CARGO_TARGET_DIR) {
    return path.join(path.resolve(process.env.CARGO_TARGET_DIR), profile);
  }
  const compiledIn = path.join(crateDir, 'target', profile);
  let config;
  try {
    config = fs.readFileSync(
      path.join(crateDir, '.cargo', 'config.toml'),
      'utf8',
    );
  } catch {
    return compiledIn;
  }
  const match = config.match(/^\s*target-dir\s*=\s*"([^"]+)"/mu);
  if (!match) return compiledIn;
  return path.join(crateDir, path.resolve('/', match[1]).slice(1), profile);
}

/**
 * Translates `desktop.json` into cargo-packager's config.
 *
 * cargo-packager is an implementation detail: users never write its JSON, and
 * replacing it would only change this function. Pure, so the whole translation
 * is unit-testable without packaging anything.
 *
 * `build` carries what the caller observed — the crate directory, the
 * executable's name, the directories holding the bundle and assets, the icon
 * files and the libraries to ship — because none of that is in the config file.
 */
export function toPackagerConfig(config, build) {
  const {
    crateDir,
    binaryName,
    bundleDir,
    assetsDir,
    icons = [],
    libraries = [],
    formats,
    outDir,
    os,
  } = build;

  // cargo-packager resolves paths relative to the crate directory, and its
  // schema uses forward slashes on every platform.
  const relative = absolute =>
    path.relative(crateDir, absolute).split(path.sep).join('/');

  // The bundle and the assets travel as resources, so the release build's
  // `resource_dir` finds them beside the executable. The bundle file and the
  // assets directory are named separately rather than shipping the whole build
  // directory, which holds the output of this very run.
  const resources = [];
  if (bundleDir !== undefined) {
    for (const candidate of ['index.bundle', 'index.bundle.hbc']) {
      const file = path.join(bundleDir, candidate);
      if (fs.existsSync(file)) {
        resources.push(relative(file));
        break;
      }
    }
  }
  if (assetsDir !== undefined && fs.existsSync(assetsDir)) {
    resources.push(relative(assetsDir));
  }
  // On Windows the runtime DLLs are already staged beside the executable by the
  // app's build.rs, and the loader looks there — but NSIS installs only the
  // binary and the resources, so "beside the executable" has to be expressed as
  // resources or the DLLs are left behind. Elsewhere they are handled per format
  // below (`Frameworks`, `lib/<app>`).
  if (os === 'windows') {
    for (const library of libraries) resources.push(relative(library));
  }
  for (const extra of config.bundle.resources ?? []) {
    // `bundle.resources` is written relative to `desktop/`, which is the crate.
    resources.push(relative(path.resolve(crateDir, extra)));
  }

  const config_ = {
    $schema:
      'https://raw.githubusercontent.com/crabnebula-dev/cargo-packager/dev/crates/packager/schema.json',
    name: binaryName,
    productName: config.productName,
    version: config.version,
    identifier: config.identifier,
    // `binariesDir` is where the executables are; `outDir` is where the
    // packages go. Without the first, cargo-packager looks for the binary
    // inside the output directory.
    binariesDir: targetProfileDir(crateDir, 'release'),
    binaries: [{ path: binaryName, main: true }],
    outDir: outDir ?? path.join(crateDir, 'build', 'dist'),
    resources,
  };
  if (formats !== undefined) {
    config_.formats = formats.map(format => PACKAGER_FORMAT[format]);
  }
  if (icons.length > 0) config_.icons = icons;
  if (config.bundle.copyright !== undefined) {
    config_.copyright = config.bundle.copyright;
  }
  if (config.bundle.category !== undefined) {
    config_.category = config.bundle.category;
  }

  const macos = {
    minimumSystemVersion: config.bundle.macos.minimumSystemVersion,
  };
  if (config.bundle.macos.entitlements !== null) {
    macos.entitlements = relative(
      path.resolve(process.cwd(), config.bundle.macos.entitlements),
    );
  }
  if (libraries.length > 0) {
    // These are *source* paths, and absolute: cargo-packager copies each one
    // into Contents/Frameworks, which is where the release build's
    // `@executable_path/../Frameworks` rpath looks. They are absolute because a
    // library can live outside the crate — the engine's come from its own
    // package — and cargo-packager opens the string as given rather than
    // resolving it against the config file.
    macos.frameworks = libraries;
  }
  config_.macos = macos;

  if (config.bundle.windows.nsis !== undefined) {
    config_.nsis = { installMode: config.bundle.windows.nsis.installMode };
  }

  // Linux keeps its libraries under `lib/<app>`, which is where the release
  // build's `$ORIGIN/../lib/<app>` rpath looks. Both Linux formats map a
  // source path to a destination inside the package, so the library goes to
  // that directory rather than wherever resources land by default.
  if (libraries.length > 0) {
    // Both Linux formats get `usr/lib/<app>`, which is where the release build's
    // `$ORIGIN/../lib/<app>` rpath looks. The AppImage needs no separate mapping:
    // cargo-packager builds the AppDir by copying the deb's data tree, so the
    // same path serves both, and `linuxdeploy` then finds the libraries through
    // that rpath rather than through `LD_LIBRARY_PATH`.
    const files = {};
    for (const library of libraries) {
      files[library] = `/usr/lib/${binaryName}/${path.basename(library)}`;
    }
    config_.deb = { ...(config_.deb ?? {}), files };
    config_.appimage = { files };
  }
  if (config.bundle.linux.deb.depends.length > 0) {
    config_.deb = {
      ...(config_.deb ?? {}),
      depends: config.bundle.linux.deb.depends,
    };
  }

  return config_;
}
