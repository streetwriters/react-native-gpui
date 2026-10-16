#!/usr/bin/env node
// lists the `// core-private:` comments the tree carries. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const SKIP_DIRS = new Set([
  '.git',
  'build',
  'dist',
  'native-deps',
  'node_modules',
  'target',
]);

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

export const ALLOW_LIST = [
  { name: 'drawerlayout' },
  { name: 'GestureResponderEvent' },
  { name: 'SafeAreaView' },
  { name: 'safeareaview' },
  { name: 'rrc_safeareaview' },
  { name: 'screenSize' },
  { name: 'screens', line: /msg_send!|NSScreen/u },
  { name: 'screenshot' },
  { name: 'screenshots' },
  { name: 'screenshot_delay_ms' },
  { name: 'RN_GPUI_SCREENSHOT' },
  { name: 'RN_GPUI_SCREENSHOT_DELAY_MS' },
  { name: 'RN_GPUI_SCREENSHOTS' },
  { name: 'svg', line: /["']svg["']|svg\+xml|ImageFormat::Svg/u },
  { name: 'Svg', line: /ImageFormat::Svg/u },
];

const ALLOWED = new Map(
  ALLOW_LIST.map(({ name, line }) => [name.toLowerCase(), line ?? null]),
);

export function classifyHits(hits) {
  return { tolerated: [], failing: hits };
}

const CORE_PRIVATE = /\/\/\s*core-private:\s*(.*)$/u;

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
}

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
    if (span.tokenStart < end) continue;
    kept.push(span);
    end = span.tokenEnd;
  }
  return kept;
}

function isAllowed(token, line) {
  const lower = token.toLowerCase();
  if (ALLOWED.has(lower)) {
    const narrow = ALLOWED.get(lower);
    return narrow === null || narrow.test(line);
  }
  const parts = token.split('_');
  if (parts.length > 1 && parts.every(part => ALLOWED.has(part.toLowerCase())))
    return true;
  // A core identifier may name an allowed thing and describe it further, as
  // `screenshot_frame_is_clipped_to_viewport` does: only the leading segment
  // decides, and only when an underscore separates it from the rest.
  const [head] = parts;
  if (parts.length > 1 && ALLOWED.has(head.toLowerCase())) {
    const narrow = ALLOWED.get(head.toLowerCase());
    return narrow === null || narrow.test(line);
  }
  return false;
}

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

export function formatReportText({ hits, corePrivate }) {
  const { tolerated, failing } = classifyHits(hits);
  const lines = formatHits(failing);
  lines.push(
    failing.length === 0
      ? 'core boundary: no library reference under packages/core'
      : `core boundary: ${failing.length} hit(s), core names a library`,
  );
  if (tolerated.length > 0)
    lines.push(
      `core boundary: ${tolerated.length} screens hit(s) pending C5 (within the baseline)`,
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
      failingCount: classifyHits(result.hits).failing.length,
      corePrivateCount: result.corePrivate.length,
    },
    null,
    2,
  )}\n`;
}

export function exitCodeFor({ hits }) {
  return classifyHits(hits).failing.length > 0 ? 1 : 0;
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
