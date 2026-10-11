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
 * Path segments that mark a binary built for a different target: another OS or
 * a different Linux libc. These are substring tests because separator styles
 * vary (`linuxmusl-x64` and `win32-x64` do not split into the marker as a whole
 * token). `ios`, which would otherwise match unrelated names such as `studios`,
 * is checked as a whole token instead.
 */
const FOREIGN_PLATFORM_SUBSTRINGS = [
  'darwin',
  'macos',
  'win32',
  'windows',
  'android',
  'musl',
];
const FOREIGN_PLATFORM_TOKENS = ['ios'];

/**
 * Whether a segment names a platform or CPU other than the host's. Architecture
 * tokens are compared after normalizing the common spellings, so `x86_64` and
 * `amd64` both become `x64` before the `x86` token could match and a plain
 * `linux-x64` segment is not mistaken for 32-bit.
 */
function namesForeignTarget(segment, arch) {
  const lower = segment.toLowerCase();
  if (FOREIGN_PLATFORM_SUBSTRINGS.some(token => lower.includes(token))) {
    return true;
  }
  const tokens = lower
    .replace(/x86[_-]?64|amd64/gu, 'x64')
    .replace(/aarch64/gu, 'arm64')
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  if (tokens.some(token => FOREIGN_PLATFORM_TOKENS.includes(token)))
    return true;
  const hostToken = arch === 'arm64' ? 'arm64' : 'x64';
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
  if (segments.some(segment => namesForeignTarget(segment, hostArch))) {
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

  return {
    name: 'react-native-gpui-node-addons',
    visitor: {
      CallExpression(nodePath, state) {
        if (!isGpuiPlatform) return;
        const { node } = nodePath;
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'require' ||
          node.arguments.length !== 1 ||
          node.arguments[0].type !== 'StringLiteral'
        ) {
          return;
        }
        const filename = state.file.opts.filename;
        if (typeof filename !== 'string' || filename === 'unknown') return;
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
