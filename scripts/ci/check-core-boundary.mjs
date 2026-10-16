#!/usr/bin/env node
// Fails when core names a library. Core is the React Native runtime plus the
// public extension APIs; every library integration lives in modules/<name>/.
//
//   node scripts/ci/check-core-boundary.mjs [--json]
//
// Scans every source file under packages/core/ for the library names in the
// deny list plus every npm package name under modules/*/package.json, and
// lists the `// core-private:` comments the tree carries. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/// Generated output, never source. A compiled runtime embeds the same strings
/// the sources do, so scanning it would report matches nobody wrote.
const SKIP_DIRS = new Set([
  '.git',
  'build',
  'dist',
  'native-deps',
  'node_modules',
  'target',
]);

/// The deny list. `RNS` and `RNGH` are the Fabric name prefixes the screens and
/// gesture-handler packages register, so they are case sensitive and start at
/// a word boundary; the lowercase `rns` inside `returns` is not a reference.
const LIBRARY_PATTERNS = [
  { name: 'svg', pattern: /svg/iu },
  { name: 'screens', pattern: /screens/iu },
  { name: 'RNS', pattern: /\bRNS/u },
  { name: 'safe.?area', pattern: /safe.?area/iu },
  { name: 'worklet', pattern: /worklet/iu },
  { name: 'reanimated', pattern: /reanimated/iu },
  { name: 'gesture.?handler', pattern: /gesture.?handler/iu },
  { name: 'RNGH', pattern: /\bRNGH/u },
  { name: 'vector.?icons', pattern: /vector.?icons/iu },
  { name: 'font_icon', pattern: /font_icon/iu },
];

/// React Native's own vocabulary, plus a few platform and image-format names
/// that merely share a spelling with a library. A hit passes only when the
/// whole identifier is one of these, so a compound the library hook owns
/// (`svgPropsJson`, `screensOp`, `svg_document`) still fails.
///
/// `line` optionally narrows an entry to lines that are clearly the other
/// meaning, so the library's own code keeps failing.
export const ALLOW_LIST = [
  // RN's accessibility role for Android's DrawerLayout container.
  { name: 'drawerlayout' },
  // RN's touch event type (Libraries/Types/CoreEventTypes).
  { name: 'GestureResponderEvent' },
  // RN's built-in SafeAreaView component, which the mounting manager mounts.
  { name: 'SafeAreaView' },
  // The same component's directory and CMake target names in ReactCommon.
  { name: 'safeareaview' },
  { name: 'rrc_safeareaview' },
  // RN's ModalHostViewState::screenSize, which core's modal descriptor reads.
  { name: 'screenSize' },
  // AppKit's NSScreen accessors: the Cocoa spelling of "all displays", not the
  // screens library, whose own `[screens]` logs and `live_screens` keep failing.
  { name: 'screens', line: /msg_send!|NSScreen/u },
  // Core's own window-capture flags and their RN_GPUI_* env spellings.
  { name: 'screenshot' },
  { name: 'screenshots' },
  { name: 'screenshot_delay_ms' },
  { name: 'RN_GPUI_SCREENSHOT' },
  { name: 'RN_GPUI_SCREENSHOT_DELAY_MS' },
  { name: 'RN_GPUI_SCREENSHOTS' },
  // The SVG image format core can paint: the MIME string and GPUI's enum.
  { name: 'svg', line: /["']svg["']|svg\+xml|ImageFormat::Svg/u },
  { name: 'Svg', line: /ImageFormat::Svg/u },
];

const ALLOWED = new Map(
  ALLOW_LIST.map(({ name, line }) => [name.toLowerCase(), line ?? null]),
);

/// The marker a direct use of core internals carries. The reason is whatever
/// follows the colon, so a reviewer sees why the exception exists.
const CORE_PRIVATE = /\/\/\s*core-private:\s*(.*)$/u;

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
}

/// Every npm package name under modules/<name>/package.json, read at run time
/// so a new module is denied without editing this script.
export function readModuleNames(root) {
  const dir = path.join(root, 'modules');
  if (!fs.existsSync(dir)) return [];
  const names = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, entry, 'package.json');
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed.name === 'string' && parsed.name.length > 0)
      names.push(parsed.name);
  }
  return [...new Set(names)].sort();
}

export function denyNames(root) {
  return [
    ...LIBRARY_PATTERNS.map(({ name }) => name),
    ...readModuleNames(root),
  ];
}

function denyMatchers(root) {
  const matchers = LIBRARY_PATTERNS.map(({ name, pattern }) => ({
    name,
    pattern: new RegExp(pattern.source, `${pattern.flags}g`),
  }));
  for (const name of readModuleNames(root)) {
    matchers.push({ name, pattern: new RegExp(escapeRegExp(name), 'gu') });
  }
  return matchers;
}

const TEST_DIRS = new Set(['__tests__', 'test', 'tests']);

/// Test sources are allowed to name a library: they only exercise it. A file
/// named `test_driver.rs` is not one, because it ships with the crate.
export function isTestFile(relPath) {
  const segments = relPath.split('/');
  const basename = segments.at(-1);
  if (segments.slice(0, -1).some(segment => TEST_DIRS.has(segment)))
    return true;
  if (/\.(test|spec)\./u.test(basename)) return true;
  if (/_test\.[a-z]+$/u.test(basename)) return true;
  if (/^Test[A-Za-z0-9_]*\.(h|hpp|cpp|cc|mm|m)$/u.test(basename)) return true;
  return /Tests?\.(h|hpp|cpp|cc|mm|m)$/u.test(basename);
}

function isSkippedFile(relPath) {
  const basename = path.basename(relPath);
  if (basename.endsWith('.md')) return true;
  if (basename === 'Cargo.lock') return true;
  return isTestFile(relPath);
}

function walk(dir, out) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/// One hit per identifier: a line that matches `screens` inside `RNSScreen`
/// and `RNS` reports the one identifier once, with its longest match.
function lineHits(line, matchers) {
  const byToken = new Map();
  for (const { name, pattern } of matchers) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const left = /[A-Za-z0-9_]*$/u.exec(line.slice(0, start))[0];
      const right = /^[A-Za-z0-9_]*/u.exec(line.slice(end))[0];
      const tokenStart = start - left.length;
      const tokenEnd = end + right.length;
      const key = `${tokenStart}:${tokenEnd}`;
      const found = byToken.get(key);
      // Keep the leftmost match in the identifier, and on a tie the longest.
      const dominated =
        found &&
        (start > found.start ||
          (start === found.start && match[0].length <= found.value.length));
      if (dominated) continue;
      byToken.set(key, {
        name,
        value: match[0],
        start,
        tokenStart,
        tokenEnd,
        token: line.slice(tokenStart, tokenEnd),
      });
    }
  }

  const spans = [...byToken.values()].sort(
    (a, b) => a.tokenStart - b.tokenStart || a.tokenEnd - b.tokenEnd,
  );
  const kept = [];
  let end = -1;
  for (const span of spans) {
    // The leftmost match in an identifier wins: `RNSScreen` is an RNS name,
    // not a `screens` one, and `@…/svg` is the package that was named.
    if (span.tokenStart < end) continue;
    kept.push(span);
    end = span.tokenEnd;
  }
  return kept;
}

/// An exact identifier match: a bare `svg` in the image MIME is the format,
/// while `svg_props_json` and `svg_document` are the library plumbing. An
/// entry with a `line` pattern applies only on a line that also matches it.
function isAllowed(token, line) {
  const lower = token.toLowerCase();
  if (ALLOWED.has(lower)) {
    const narrow = ALLOWED.get(lower);
    return narrow === null || narrow.test(line);
  }
  const parts = token.split('_');
  return (
    parts.length > 1 && parts.every(part => ALLOWED.has(part.toLowerCase()))
  );
}

/// Scans one checkout. `root` holds `packages/core/` and `modules/`, so a
/// fixture tree exercises exactly what CI does.
export function scanCoreBoundary({ root = repoRoot } = {}) {
  const coreDir = path.join(root, 'packages', 'core');
  const matchers = denyMatchers(root);
  const hits = [];
  const corePrivate = [];

  for (const file of walk(coreDir, [])) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (isSkippedFile(rel.slice('packages/core/'.length))) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('\0')) continue;
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      for (const hit of lineHits(line, matchers)) {
        if (isAllowed(hit.token, line)) continue;
        hits.push({
          file: rel,
          line: index + 1,
          match: hit.value,
          pattern: hit.name,
        });
      }
      const reason = CORE_PRIVATE.exec(line);
      if (reason)
        corePrivate.push({
          file: rel,
          line: index + 1,
          reason: reason[1].trim(),
        });
    }
  }

  return { hits, corePrivate };
}

export function formatHits(hits) {
  return hits.map(({ file, line, match }) => `${file}:${line}: ${match}`);
}

/// The hits first, in `file:line: <match>` form, then the core-private list.
export function formatReportText({ hits, corePrivate }) {
  const lines = formatHits(hits);
  lines.push(
    hits.length === 0
      ? 'core boundary: no library reference under packages/core'
      : `core boundary: ${hits.length} hit(s), core names a library`,
  );
  lines.push(
    corePrivate.length === 0
      ? 'core-private: none'
      : `core-private: ${corePrivate.length} comment(s)`,
  );
  for (const { file, line, reason } of corePrivate)
    lines.push(`${file}:${line}: ${reason}`);
  return lines.join('\n');
}

export function formatJson(result) {
  return `${JSON.stringify(
    {
      hits: result.hits,
      corePrivate: result.corePrivate,
      hitCount: result.hits.length,
      corePrivateCount: result.corePrivate.length,
    },
    null,
    2,
  )}\n`;
}

export function exitCodeFor({ hits }) {
  return hits.length > 0 ? 1 : 0;
}

function parseArgs(argv) {
  const parsed = { json: false };
  for (const arg of argv) {
    if (arg === '--json') parsed.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function main() {
  const { json } = parseArgs(process.argv.slice(2));
  const result = scanCoreBoundary();
  const text = json ? formatJson(result) : `${formatReportText(result)}\n`;
  process.stdout.write(text);
  process.exitCode = exitCodeFor(result);
}

function isEntryPoint() {
  if (process.argv[1] === undefined) return false;
  try {
    return (
      fs.realpathSync(fileURLToPath(import.meta.url)) ===
      fs.realpathSync(path.resolve(process.argv[1]))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main();
  } catch (error) {
    console.error(`check-core-boundary: ${error.message}`);
    process.exitCode = 2;
  }
}
