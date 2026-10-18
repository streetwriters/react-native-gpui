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

  return [...libraries].sort();
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
  const targetFromEnv = process.env.CARGO_TARGET_DIR;
  const roots = [
    targetFromEnv === undefined ? undefined : path.resolve(targetFromEnv),
    path.join(projectRoot, 'desktop', 'target'),
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
