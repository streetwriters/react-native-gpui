// Babel plugin: turn `require('….node')` / `import … from '….node'` into
// `_requireNodeLibrary(key, path)` for the GPUI desktop runtime.
//
// On a phone an app may only load code that was embedded and signed at build
// time, so addons are discovered ahead of time and loaded through a shim. A
// desktop app has none of those restrictions: it can `dlopen` any file, so the
// stock `.node` binary a package publishes to npm loads unchanged. All this
// plugin does is tell the runtime which file to open and give it a stable name
// for that file.
//
// It is a no-op unless Babel's caller reports `platform === 'gpui'`, so one
// `babel.config.js` works for iOS, Android and desktop.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ELF magic and e_machine values, enough to tell a Linux addon for the host
// architecture from one built for another platform or CPU.
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

// Mach-O magics as the byte order they appear in the file:
//   CF FA ED FE / CE FA ED FE  64- and 32-bit thin, little-endian fields
//   FE ED FA CF / FE ED FA CE  the same, big-endian fields
//   CA FE BA BE                universal, big-endian table
//   BE BA FE CA                universal, little-endian table
const MACHO_THIN_LE = Buffer.from([0xcf, 0xfa, 0xed, 0xfe]);
const MACHO_THIN_LE_32 = Buffer.from([0xce, 0xfa, 0xed, 0xfe]);
const MACHO_THIN_BE = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]);
const MACHO_THIN_BE_32 = Buffer.from([0xfe, 0xed, 0xfa, 0xce]);
const MACHO_FAT_BE = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
const MACHO_FAT_LE = Buffer.from([0xbe, 0xba, 0xfe, 0xca]);

// cputype values that mean "the host CPU" for each arch name.
const CPU_TYPES = {
  arm64: 0x0100000c,
  x64: 0x01000007,
  ia32: 0x00000007,
};

const ELF_MACHINE = {
  arm64: 0xb7,
  x64: 0x3e,
  ia32: 0x03,
};

/**
 * Platform markers that appear in a prebuild directory or file name, and the
 * host platform each one belongs to. A segment naming a *different* platform
 * is foreign; one naming the host's is not.
 */
const PLATFORM_MARKERS = {
  darwin: 'darwin',
  macos: 'darwin',
  osx: 'darwin',
  win32: 'win32',
  windows: 'win32',
  linux: 'linux',
  linuxmusl: 'linux',
  android: 'android',
  freebsd: 'freebsd',
  openharmony: 'openharmony',
};

/**
 * Whether a segment names a libc other than the host's. `musl` on a glibc host
 * cannot load (and the reverse), and neither can an `eabi`/`gnueabihf` ARM
 * variant on a soft-float host.
 */
function namesForeignLibc(segment) {
  return /\bmusl\b|musleabihf|musl-/u.test(segment);
}

/**
 * Whether a segment names a platform or CPU other than the host's. Architecture
 * tokens are compared after normalizing the common spellings, so `x86_64` and
 * `amd64` both become `x64` before the `x86` token could match and a plain
 * `linux-x64` segment is not mistaken for 32-bit.
 */
function namesForeignTarget(segment, hostPlatform, hostArch) {
  const lower = segment.toLowerCase();
  // A platform marker is only foreign when it is not the host's. `darwin` and
  // `linux` both appear in the paths the plugin is *supposed* to accept on
  // their own platform.
  for (const [marker, platform] of Object.entries(PLATFORM_MARKERS)) {
    if (!lower.includes(marker)) continue;
    if (platform !== hostPlatform) return true;
    // The host platform matched; a foreign libc in the same segment still
    // disqualifies it.
    if (namesForeignLibc(lower)) return true;
  }
  const tokens = lower
    .replace(/x86[_-]?64|amd64/gu, 'x64')
    .replace(/aarch64/gu, 'arm64')
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  // `ios` as a whole token: it would otherwise match unrelated names such as
  // `studios`.
  if (tokens.includes('ios') && hostPlatform !== 'ios') return true;
  const hostToken = hostArch === 'arm64' ? 'arm64' : 'x64';
  return tokens.some(
    token =>
      ['x64', 'arm64', 'arm', 'ia32', 'x86'].includes(token) &&
      token !== hostToken,
  );
}

function isElfForArch(header, arch) {
  if (!header.subarray(0, 4).equals(ELF_MAGIC)) return null;
  const machine = ELF_MACHINE[arch];
  if (machine === undefined) return false;
  return header.readUInt16LE(18) === machine;
}

/**
 * Whether a Mach-O file contains a slice for `arch`. A thin file has one
 * cputype at offset 4; a universal file has a table of them after the 8-byte
 * header, each `fat_arch` starting with its own cputype. Anything we cannot
 * parse is accepted, so an unusual-but-valid binary is never rejected.
 */
function machoHasArch(header, arch) {
  const expected = CPU_TYPES[arch];
  if (expected === undefined) return false;
  const magic = header.subarray(0, 4);
  const isFat = magic.equals(MACHO_FAT_BE) || magic.equals(MACHO_FAT_LE);
  const read =
    magic.equals(MACHO_FAT_LE) ||
    magic.equals(MACHO_THIN_LE) ||
    magic.equals(MACHO_THIN_LE_32)
      ? offset => header.readUInt32LE(offset)
      : offset => header.readUInt32BE(offset);
  if (isFat) {
    if (header.length < 8) return true;
    const count = read(4);
    if (count === 0 || count > 64) return true;
    const fatEntrySize = 20;
    if (header.length < 8 + count * fatEntrySize) return true;
    for (let index = 0; index < count; index += 1) {
      if (read(8 + index * fatEntrySize) === expected) return true;
    }
    return false;
  }
  if (header.length < 8) return true;
  return read(4) === expected;
}

/**
 * Whether `filePath` is a shared library for the host. A file built for another
 * platform or CPU is treated as missing, so a package's per-platform binary
 * list does not make the bundle try to load one that cannot work.
 */
function isHostPrebuiltNodeAddon(filePath, hostPlatform, hostArch) {
  const segments = filePath.split(path.sep);
  if (
    segments.some(segment =>
      namesForeignTarget(segment, hostPlatform, hostArch),
    )
  ) {
    return false;
  }
  let handle;
  try {
    handle = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(40);
    const read = fs.readSync(handle, header, 0, header.length, 0);
    if (read < 20) return false;
    const headerBytes = header.subarray(0, read);
    if (hostPlatform === 'linux') {
      return isElfForArch(headerBytes, hostArch) === true;
    }
    if (hostPlatform === 'darwin') {
      const magic = headerBytes.subarray(0, 4);
      const known =
        magic.equals(MACHO_THIN_LE) ||
        magic.equals(MACHO_THIN_LE_32) ||
        magic.equals(MACHO_THIN_BE) ||
        magic.equals(MACHO_THIN_BE_32) ||
        magic.equals(MACHO_FAT_BE) ||
        magic.equals(MACHO_FAT_LE);
      if (!known) return false;
      return machoHasArch(headerBytes, hostArch);
    }
    // Windows support is written but not part of this work; until then every
    // file is accepted there, which is the same as no guard.
    return true;
  } catch {
    return false;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

/**
 * The stable, relative key for an addon (section 3.3 of the plan):
 *
 *   - if the real path has a `node_modules` segment, everything from the first
 *     `node_modules/` onward, with `/` separators;
 *   - otherwise `local/<first 8 hex of sha1(absolute path)>/<basename>`.
 *
 * The key is how a packaged app finds the addon after `node_modules` is gone,
 * so it must be portable: always `/`, never `..`, never a leading slash.
 */
function addonKey(absolutePath) {
  const normalized = absolutePath.split(path.sep).join('/');
  const marker = '/node_modules/';
  const index = normalized.indexOf(marker);
  const key =
    index === -1
      ? `local/${crypto
          .createHash('sha1')
          .update(normalized)
          .digest('hex')
          .slice(0, 8)}/${path.posix.basename(normalized)}`
      : normalized.slice(index + 1);
  if (
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').includes('..')
  ) {
    throw new Error(`invalid node addon key '${key}' for ${absolutePath}`);
  }
  return key;
}

/** Files Metro would resolve before an extensionless `.node` file. */
const RESOLVABLE_EXTENSIONS = ['.js', '.cjs', '.mjs', '.json', '.ts', '.tsx'];

/**
 * Classifies a specifier written in `fromDirectory`:
 *
 *   { kind: 'addon', path }  a host `.node` file to load;
 *   { kind: 'missing' }      an explicit `.node` specifier with no usable file
 *                            (`missingModuleExpression` must stand in for it);
 *   null                     not an addon reference at all, so the require or
 *                            import is left exactly as written.
 *
 * The `missing` case exists because packages list a binary per platform and
 * wrap each in `try`/`catch`: the ones that are not installed must fail at run
 * time, not at bundle time.
 */
function resolveAddon(specifier, fromDirectory, options) {
  const { hostPlatform, hostArch } = options;
  const usable = filePath =>
    isHostPrebuiltNodeAddon(filePath, hostPlatform, hostArch) ? filePath : null;

  const tryFile = candidate => {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const resolved = usable(candidate);
      return resolved === null
        ? { kind: 'missing' }
        : { kind: 'addon', path: resolved };
    }
    return { kind: 'missing' };
  };

  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const isAbsolute = path.isAbsolute(specifier);

  // R1: an explicit `.node` specifier.
  if (specifier.endsWith('.node')) {
    if (isRelative || isAbsolute) {
      return tryFile(
        isAbsolute ? specifier : path.resolve(fromDirectory, specifier),
      );
    }
    // A bare specifier, either `pkg/x.node` or an addon a package lists in its
    // own manifest. `require.resolve` follows the package's own entry points.
    try {
      const resolved = require.resolve(specifier, { paths: [fromDirectory] });
      if (fs.statSync(resolved).isFile()) {
        const addonPath = usable(resolved);
        return addonPath === null
          ? { kind: 'missing' }
          : { kind: 'addon', path: addonPath };
      }
    } catch {}
    return { kind: 'missing' };
  }

  // R2: a relative specifier with no extension, where `<path>.node` exists and
  // nothing Metro would resolve first does.
  if (isRelative || isAbsolute) {
    const candidate = path.resolve(fromDirectory, specifier);
    if (
      RESOLVABLE_EXTENSIONS.some(extension =>
        fs.existsSync(candidate + extension),
      )
    ) {
      return null;
    }
    // A package.json or index file is a real module too.
    if (fs.existsSync(path.join(candidate, 'package.json'))) return null;
    for (const index of ['index.js', 'index.ts', 'index.tsx', 'index.json']) {
      if (fs.existsSync(path.join(candidate, index))) return null;
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return null;
    }
    if (!fs.existsSync(`${candidate}.node`)) return null;
    return tryFile(`${candidate}.node`);
  }

  // R3: a bare package whose installed `main` (or `exports` entry) is an addon.
  try {
    const entry = require.resolve(specifier, { paths: [fromDirectory] });
    if (!entry.endsWith('.node')) return null;
    const addonPath = usable(entry);
    return addonPath === null
      ? { kind: 'missing' }
      : { kind: 'addon', path: addonPath };
  } catch {
    // Not installed here. A package a platform-specific branch would have
    // loaded is not our business; leave the require to Metro, which reports it
    // the same way it would for any missing module.
    return null;
  }
}

// --- R4–R6: packages that pick their binary at run time ---------------------
//
// Most packages do not write `require('./x.node')` themselves. They use a small
// loader that chooses the binary with `fs`, `path` and `process.platform` — none
// of which exist in Hermes. On desktop the build machine *is* the target, so the
// plugin can run that selection at build time instead, using the package's own
// data.

/** `node-gyp-build`'s own prebuild layout, plus the directories it probes. */
const NODE_GYP_BUILD_DIRECTORIES = [
  '.',
  'build',
  'build/Debug',
  'build/Release',
  'build/RelWithDebInfo',
  'build/MinSizeRel',
  'out',
];

/**
 * The `prebuilds/<platform>-<arch>/` tags `node-gyp-build` looks for, most
 * specific first. It also accepts a bare `<platform>-<arch>` and a
 * `node.napi` fallback, which is what a package that only ships one N-API
 * build uses.
 */
function nodeGypBuildTags(hostPlatform, hostArch) {
  const platform = hostPlatform === 'darwin' ? 'darwin' : hostPlatform;
  const arch = hostArch === 'x64' ? 'x64' : hostArch;
  return [`${platform}-${arch}`, `${platform}-${arch}-napi`, 'node.napi'];
}

/** The file extensions a prebuilt binary of `name` can have per platform. */
function prebuiltSuffixes(hostPlatform) {
  if (hostPlatform === 'win32') return ['.node', '.dll'];
  return ['.node', '.so', '.dylib'];
}

/**
 * Resolves `require('node-gyp-build')(<dir>)` at build time (R4) by reproducing
 * the resolver `node-gyp-build` itself runs, against the host the bundle is
 * being built for.
 */
function resolveNodeGypBuild(directory, options) {
  const { hostPlatform, hostArch } = options;
  const candidates = [];
  for (const tag of nodeGypBuildTags(hostPlatform, hostArch)) {
    candidates.push(path.join(directory, 'prebuilds', tag));
  }
  for (const candidate of candidates) {
    let entries;
    try {
      entries = fs.readdirSync(candidate, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const suffix = prebuiltSuffixes(hostPlatform).find(extension =>
        entry.name.endsWith(extension),
      );
      if (!suffix) continue;
      if (
        !isHostPrebuiltNodeAddon(
          path.join(candidate, entry.name),
          hostPlatform,
          hostArch,
        )
      ) {
        continue;
      }
      return path.join(candidate, entry.name);
    }
  }
  // The in-tree builds and the plain `build/Release` layout.
  for (const subdirectory of NODE_GYP_BUILD_DIRECTORIES) {
    const base = path.join(directory, subdirectory);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.node')) continue;
      const filePath = path.join(base, entry.name);
      if (isHostPrebuiltNodeAddon(filePath, hostPlatform, hostArch)) {
        return filePath;
      }
    }
  }
  return null;
}

/**
 * The directories `bindings` searches, in its own order (R5). Read from its
 * source: it walks up from the calling module's directory looking for a
 * `package.json`, then tries these relative to each ancestor.
 */
const BINDINGS_DIRECTORIES = [
  'build/Release',
  'build/Debug',
  'build/RelWithDebInfo',
  'build/MinSizeRel',
  'out/Release',
  'out/Debug',
  'Release',
  'Debug',
  'Release/node-v',
  'Debug/node-v',
  'build',
  'out',
  'compiled',
  'addon-build/release/install-root',
  'addon-build/debug/install-root',
  'addon-build/default/install-root',
];

/**
 * Resolves `require('bindings')('<name>')` at build time (R5). `bindings`
 * searches upward from the package root for `package.json` and then tries each
 * candidate directory; this walks the same ancestors of `fromDirectory`.
 */
function resolveBindings(name, fromDirectory, options) {
  const { hostPlatform, hostArch } = options;
  let directory = fromDirectory;
  for (;;) {
    const candidates = [directory];
    const parent = path.dirname(directory);
    if (parent !== directory) candidates.push(parent);
    for (const base of candidates) {
      for (const subdirectory of BINDINGS_DIRECTORIES) {
        const target = path.join(base, subdirectory, name);
        for (const candidate of [target, `${target}.node`]) {
          try {
            if (!fs.statSync(candidate).isFile()) continue;
          } catch {
            continue;
          }
          if (isHostPrebuiltNodeAddon(candidate, hostPlatform, hostArch)) {
            return candidate;
          }
        }
      }
    }
    // `bindings` stops at the directory holding `package.json`, so a nested
    // call inside a package resolves against that package only.
    if (fs.existsSync(path.join(directory, 'package.json'))) break;
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/**
 * `process.platform` / `process.arch` as a napi-rs loader spells them in the
 * file name (`linux-x64-gnu`, `win32-arm64-msvc`). The host's own triple, from
 * most to least preferred: glibc beats musl on Linux, msvc beats gnu on
 * Windows.
 */
function napiRsTriples(hostPlatform, hostArch) {
  const platform = hostPlatform;
  if (platform === 'linux') {
    return [`linux-${hostArch}-gnu`, `linux-${hostArch}-musl`];
  }
  if (platform === 'win32') {
    return [`win32-${hostArch}-msvc`, `win32-${hostArch}-gnu`];
  }
  if (platform === 'darwin') {
    return [`darwin-${hostArch}`, 'darwin-universal'];
  }
  return [`${platform}-${hostArch}`];
}

/**
 * Detects a napi-rs generated loader and returns the binary it would pick (R6).
 *
 * The generated file is one big `if (process.platform === …)` chain whose
 * branches `require` either a local `<name>.<triple>.node` or a per-platform
 * package `<pkg>-<triple>`. Detection is a heuristic, per the plan: a module
 * with several `.node` requires for *different* platforms is one of these. When
 * a file matches but no host binary exists it is left untouched.
 */
function resolveNapiRsLoader(source, filename, options) {
  const { hostPlatform, hostArch } = options;
  const triples = napiRsTriples(hostPlatform, hostArch);
  // Every triple named in the file, so a non-loader that happens to require a
  // couple of binaries is not misread.
  const mentioned = new Set();
  const triplePattern =
    /\b(?:darwin|linux|win32|android|freebsd|openharmony)-(?:x64|arm64|arm|ia32|loong64|riscv64|ppc64|s390x)(?:-(?:gnu|musl|msvc|eabi|gnueabihf|musleabihf))?\b/gu;
  for (const match of source.matchAll(triplePattern)) {
    mentioned.add(match[0]);
  }
  // A napi-rs loader names at least three platforms; a hand-written file that
  // happens to name two is left alone.
  const platforms = new Set([...mentioned].map(triple => triple.split('-')[0]));
  if (platforms.size < 3) return null;

  const directory = path.dirname(filename);
  // The local copy first, exactly as the loader tries it.
  for (const triple of triples) {
    const local = path.join(directory, `${triple}.node`);
    if (fs.existsSync(local)) {
      if (isHostPrebuiltNodeAddon(local, hostPlatform, hostArch)) return local;
    }
    // `<name>.<triple>.node` for any prefix the file uses.
    let entries = [];
    try {
      entries = fs.readdirSync(directory);
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.endsWith(`.${triple}.node`)) continue;
      const filePath = path.join(directory, entry);
      if (isHostPrebuiltNodeAddon(filePath, hostPlatform, hostArch)) {
        return filePath;
      }
    }
  }

  // Then the per-platform packages, whose own entry is the `.node` file itself.
  const scoped = /require\((['"])(@[^'"]+|[^'"./][^'"]*)\1\)/gu;
  const packageNames = new Set();
  for (const match of source.matchAll(scoped)) {
    packageNames.add(match[2]);
  }
  for (const triple of triples) {
    for (const packageName of packageNames) {
      if (!packageName.endsWith(triple)) continue;
      try {
        const entry = require.resolve(packageName, { paths: [directory] });
        if (
          entry.endsWith('.node') &&
          isHostPrebuiltNodeAddon(entry, hostPlatform, hostArch)
        ) {
          return entry;
        }
      } catch {}
    }
  }
  return null;
}

module.exports = function babelPluginNodeAddons(api, options = {}) {
  const t = api.types;
  const hostPlatform = options.hostPlatform ?? process.platform;
  const hostArch = options.hostArch ?? process.arch;
  const embedPaths = options.embedPaths !== false;
  const pluginOptions = { hostPlatform, hostArch };
  // Resolving a bare specifier costs a `require.resolve`, and the visitor sees
  // every literal `require` in the bundle, so the answer is memoised per file
  // directory and specifier.
  const resolutionCache = new Map();
  // One warning per (file, reason), so a loader in a widely-imported module
  // does not fill the bundler's output.
  const warned = new Set();
  const warnOnce = (state, message) => {
    const key = `${state.file.opts.filename}\u0000${message}`;
    if (warned.has(key)) return;
    warned.add(key);
    state.file.metadata.rnGpuiNodeAddonWarnings ??= [];
    state.file.metadata.rnGpuiNodeAddonWarnings.push(message);
    // `console` is all a Babel plugin has; Metro shows it with the file name.
    console.warn(`[react-native-gpui/babel-plugin-node-addons] ${message}`);
  };
  // Read once, at config time: `api.caller` caches the answer and refuses a
  // callback once traversal has started.
  const isGpuiPlatform = api.caller(caller => caller?.platform) === 'gpui';

  const missingModuleExpression = specifier => {
    const error = t.callExpression(t.identifier('Error'), [
      t.stringLiteral(`Cannot find module '${specifier}'`),
    ]);
    // (() => { const error = new Error(...); error.code = 'MODULE_NOT_FOUND';
    //         throw error; })()
    return t.callExpression(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier('error'), error),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('error'), t.identifier('code')),
              t.stringLiteral('MODULE_NOT_FOUND'),
            ),
          ),
          t.throwStatement(t.identifier('error')),
        ]),
      ),
      [],
    );
  };

  const requireNodeLibraryCall = resolvedPath => {
    const key = addonKey(fs.realpathSync(resolvedPath));
    const args = [t.stringLiteral(key)];
    if (embedPaths) args.push(t.stringLiteral(resolvedPath));
    return t.callExpression(t.identifier('_requireNodeLibrary'), args);
  };

  /**
   * The expression an addon reference becomes. `null` means the specifier is
   * not an addon reference after all and must be left alone.
   */
  const addonExpression = (specifier, fromDirectory) => {
    const cacheKey = `${fromDirectory}\u0000${specifier}`;
    let resolution = resolutionCache.get(cacheKey);
    if (resolution === undefined) {
      resolution = resolveAddon(specifier, fromDirectory, pluginOptions);
      resolutionCache.set(cacheKey, resolution);
    }
    if (resolution === null) return null;
    if (resolution.kind === 'missing')
      return missingModuleExpression(specifier);
    return requireNodeLibraryCall(resolution.path);
  };

  /** The directory argument of a `node-gyp-build`-style call, if static. */
  const staticDirectoryArgument = (argument, fromDirectory) => {
    if (argument === undefined) return null;
    // `__dirname`
    if (argument.type === 'Identifier' && argument.name === '__dirname') {
      return fromDirectory;
    }
    // `path.join(__dirname, 'literal', ...)` or the same call reached through
    // the module: `require('path').join(...)`.
    if (argument.type === 'CallExpression') {
      const callee = argument.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'join'
      ) {
        return null;
      }
      const isPathModule = object =>
        (object.type === 'Identifier' && object.name === 'path') ||
        (object.type === 'CallExpression' &&
          object.callee.type === 'Identifier' &&
          object.callee.name === 'require' &&
          object.arguments.length === 1 &&
          object.arguments[0].type === 'StringLiteral' &&
          object.arguments[0].value === 'path');
      if (!isPathModule(callee.object)) return null;
      const parts = [];
      let base = null;
      for (const part of argument.arguments) {
        if (part.type === 'StringLiteral') {
          parts.push(part.value);
        } else if (part.type === 'Identifier' && part.name === '__dirname') {
          base = fromDirectory;
        } else {
          return null;
        }
      }
      if (base === null) return null;
      return path.resolve(base, ...parts);
    }
    return null;
  };

  /** The string argument of a `bindings('<name>')` call, if static. */
  const staticBindingsName = argument => {
    if (argument === undefined) return null;
    if (argument.type === 'StringLiteral') return argument.value;
    // `{ bindings: '<name>' }`
    if (argument.type === 'ObjectExpression') {
      for (const property of argument.properties) {
        if (
          property.type === 'ObjectProperty' &&
          !property.computed &&
          property.key.type === 'Identifier' &&
          property.key.name === 'bindings' &&
          property.value.type === 'StringLiteral'
        ) {
          return property.value.value;
        }
      }
    }
    return null;
  };

  /**
   * R4/R5: recognises `require('node-gyp-build')(<dir>)` and
   * `require('bindings')(<name>)` and returns the expression that replaces the
   * whole call, or `null` when resolution failed (a throwing expression is
   * emitted and one warning printed), or `undefined` when the node is not one
   * of these calls at all.
   */
  const loaderCallExpression = (node, fromDirectory, state) => {
    // The outer call is `require('x')(...)`: its callee is the inner `require`.
    if (node.callee.type !== 'CallExpression') return undefined;
    const inner = node.callee;
    if (
      inner.callee.type !== 'Identifier' ||
      inner.callee.name !== 'require' ||
      inner.arguments.length !== 1 ||
      inner.arguments[0].type !== 'StringLiteral'
    ) {
      return undefined;
    }
    const loaderName = inner.arguments[0].value;
    if (loaderName === 'node-gyp-build') {
      const directory = staticDirectoryArgument(
        node.arguments[0],
        fromDirectory,
      );
      if (directory === null) return undefined;
      const resolved = resolveNodeGypBuild(directory, pluginOptions);
      if (resolved !== null) return requireNodeLibraryCall(resolved);
      warnOnce(
        state,
        `node-gyp-build: no ${pluginOptions.hostPlatform}-${pluginOptions.hostArch} binary under ${directory}`,
      );
      return missingModuleExpression('node-gyp-build');
    }
    if (loaderName === 'bindings') {
      const name = staticBindingsName(node.arguments[0]);
      if (name === null) return undefined;
      const resolved = resolveBindings(name, fromDirectory, pluginOptions);
      if (resolved !== null) return requireNodeLibraryCall(resolved);
      warnOnce(
        state,
        `bindings: no ${pluginOptions.hostPlatform}-${pluginOptions.hostArch} binary named '${name}' from ${fromDirectory}`,
      );
      return missingModuleExpression('bindings');
    }
    return undefined;
  };

  return {
    name: 'react-native-gpui-node-addons',
    visitor: {
      CallExpression(nodePath, state) {
        if (!isGpuiPlatform) return;
        const { node } = nodePath;
        const filename = state.file.opts.filename;
        if (typeof filename !== 'string' || filename === 'unknown') return;
        const fromDirectory = path.dirname(filename);

        // R4/R5: the whole loader call is replaced, so it is matched before the
        // `require` inside it — `require('node-gyp-build')(__dirname)` would
        // otherwise be visited on the way down and left as it is anyway, since
        // neither specifier ends in `.node`.
        const loader = loaderCallExpression(node, fromDirectory, state);
        if (loader !== undefined) {
          if (loader === null) return;
          nodePath.replaceWith(loader);
          return;
        }

        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'require' ||
          node.arguments.length !== 1 ||
          node.arguments[0].type !== 'StringLiteral'
        ) {
          return;
        }
        const specifier = node.arguments[0].value;
        // A dynamic `import()` is a different node type entirely, and the
        // `require` a bundler synthesises from it is not what this rewrites.
        if (nodePath.parentPath.isCallExpression({ callee: node })) return;
        const expression = addonExpression(specifier, path.dirname(filename));
        // `addonExpression` returns null when the specifier turned out not to
        // name an addon, so every other require is left for Metro.
        if (expression === null) return;
        nodePath.replaceWith(expression);
      },

      // R6: a napi-rs generated loader is replaced as a whole module, since
      // every branch of its `process.platform` chain is dead here.
      Program(nodePath, state) {
        if (!isGpuiPlatform) return;
        const filename = state.file.opts.filename;
        if (typeof filename !== 'string' || filename === 'unknown') return;
        // Babel hands the original source here even when the transform was
        // given a string rather than a file, which is how the unit tests drive
        // it; the on-disk file name is still what relative requires resolve
        // against.
        const source = state.file.code;
        if (typeof source !== 'string') return;
        // Cheap gate before the full check: a napi-rs loader always branches
        // on the platform.
        if (!/(?:process\.platform|process\.config)/u.test(source)) return;
        const resolved = resolveNapiRsLoader(source, filename, pluginOptions);
        if (resolved === null) return;
        for (const statement of nodePath.get('body')) {
          statement.remove();
        }
        nodePath.pushContainer(
          'body',
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(
                t.identifier('module'),
                t.identifier('exports'),
              ),
              requireNodeLibraryCall(resolved),
            ),
          ),
        );
      },

      ImportDeclaration(nodePath, state) {
        if (!isGpuiPlatform) return;
        const { node } = nodePath;
        if (
          typeof node.source.value !== 'string' ||
          !/\.node$/u.test(node.source.value)
        ) {
          return;
        }
        const filename = state.file.opts.filename;
        if (typeof filename !== 'string' || filename === 'unknown') return;
        const specifier = node.source.value;
        const expression = addonExpression(specifier, path.dirname(filename));
        if (expression === null) return;

        // Every form binds the same exports object: a default import is the
        // object itself, a namespace import is the object itself, and named
        // imports are destructured from it.
        const statements = [];
        const shared = t.identifier('_nodeAddonExports');
        const named = node.specifiers.filter(
          item => item.type === 'ImportSpecifier' && item.imported,
        );
        const bound = node.specifiers.filter(
          item =>
            item.type === 'ImportDefaultSpecifier' ||
            item.type === 'ImportNamespaceSpecifier',
        );
        const needsShared = bound.length > 0 || named.length > 0;
        if (needsShared) {
          statements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(shared, expression),
            ]),
          );
        }
        for (const item of bound) {
          statements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(item.local, shared),
            ]),
          );
        }
        if (named.length > 0) {
          statements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.objectPattern(
                  named.map(item =>
                    t.objectProperty(item.imported, item.local),
                  ),
                ),
                shared,
              ),
            ]),
          );
        }
        if (statements.length === 0) {
          // A bare `import 'x.node'` still has to load the addon.
          statements.push(t.expressionStatement(expression));
        }
        nodePath.replaceWithMultiple(statements);
      },
    },
  };
};

module.exports.addonKey = addonKey;
module.exports.isHostPrebuiltNodeAddon = isHostPrebuiltNodeAddon;
module.exports.resolveAddon = resolveAddon;
