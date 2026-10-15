import { describe, expect, test } from 'vitest';
import { errorExcerpt, ERROR_PATTERNS, slugify } from './step.mjs';

// One sample per pattern family, written the way the real tool prints it. The
// `family` matches the `family` field in ERROR_PATTERNS.
const SAMPLES = [
  {
    family: 'rustc',
    label: 'rustc',
    log: `   Compiling rn-gpui-sys v0.1.0
error[E0425]: cannot find function \`run_test\` in crate \`gpui\`
  --> rn-gpui/src/store.rs:1160:5
error: could not compile \`react-native-gpui\``,
  },
  {
    family: 'cmake',
    label: 'cmake',
    log: `-- Configuring done
CMake Error at cpp/CMakeLists.txt:96 (message):
  Hermes library not found at /tmp/hermes/bin/darwin-arm64/libhermesvm.dylib.`,
  },
  {
    family: 'msvc',
    label: 'msvc',
    log: `  GpuiHost.cpp
C:\\src\\GpuiHost.cpp(120): error C2065: 'devMode': undeclared identifier
LINK : fatal error LNK1181: cannot open input file 'hermesvm.lib'`,
  },
  {
    family: 'linker',
    label: 'ld',
    log: `  = note: ld: warning: search path '/tmp/bin' not found
          ld: library 'hermesvm' not found
clang: error: linker command failed with exit code 1`,
  },
  {
    family: 'linker',
    label: 'ld undefined reference',
    log: `ld: undefined reference to \`facebook::react::ReactHost::loadScript'
collect2: error: ld returned 1 exit status`,
  },
  {
    family: 'linker',
    label: 'ld undefined symbols',
    log: `Undefined symbols for architecture arm64:
  "_rn_gpui_on_image_load_result", referenced from:`,
  },
  {
    family: 'vitest',
    label: 'vitest',
    log: ` ❯ packages/core/metro.config.test.js (3 tests | 1 failed)
 FAIL  packages/core/metro.config.test.js > resolves the tester root
AssertionError: expected '../@react-native-gpui/core' to be '../core'`,
  },
  {
    family: 'npm',
    label: 'npm',
    log: `npm ERR! code ELIFECYCLE
npm error command sh -c node scripts/run-desktop.mts --no-launch`,
  },
  {
    family: 'panic',
    label: 'panic',
    log: `thread 'main' panicked at rn-gpui-sys/build.rs:832:5:
overridesSha256 failed: Cannot find module '/tmp/a6-app/core/scripts/repo-root.mjs'`,
  },
  {
    family: 'github',
    label: 'github',
    log: `##[error]Process completed with exit code 1.`,
  },
];

describe('errorExcerpt', () => {
  test.each(SAMPLES)(
    'finds the error line in a $label log',
    ({ family, log }) => {
      const excerpt = errorExcerpt(log);
      const patterns = ERROR_PATTERNS.filter(entry => entry.family === family);
      expect(patterns.length).toBeGreaterThan(0);
      const lines = excerpt.split('\n');
      expect(
        lines.some(line => patterns.some(({ pattern }) => pattern.test(line))),
      ).toBe(true);
    },
  );

  test('every declared family is covered by a sample', () => {
    const families = new Set(ERROR_PATTERNS.map(entry => entry.family));
    const covered = new Set(SAMPLES.map(sample => sample.family));
    for (const family of families) expect(covered.has(family)).toBe(true);
  });

  test('matches each individual pattern', () => {
    const probe = [
      'error[E0425]',
      'error: could not compile',
      'CMake Error at x',
      'x(1): error C2065',
      'LINK : error LNK1181',
      'fatal error LNK1181',
      "ld: library 'x' not found",
      'undefined reference to x',
      'Undefined symbols for architecture',
      'FAIL  a.test.js',
      'AssertionError: nope',
      'npm ERR! code 1',
      'npm error command failed',
      'panicked at src/main.rs:1:1',
      '##[error]boom',
    ];
    for (const line of probe) {
      expect(errorExcerpt(line), line).toContain(line);
    }
  });

  test('keeps up to 40 lines around the match and the last 20', () => {
    const noise = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    const log = [
      ...noise.slice(0, 100),
      'CMake Error at x',
      ...noise.slice(101),
    ].join('\n');
    const excerpt = errorExcerpt(log);
    expect(excerpt).toContain('CMake Error at x');
    expect(excerpt).toContain('line 199');
    expect(excerpt).toContain(
      'lines ... skipped ...'.replace('lines ... ', ''),
    );
    // Far less than the whole log, and it says where it skipped.
    expect(excerpt.split('\n').length).toBeLessThan(80);
    expect(excerpt).toMatch(/line\(s\) skipped/u);
  });

  test('merges overlapping regions without repeating a line', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    lines[28] = 'error: the only failure';
    const excerpt = errorExcerpt(lines.join('\n'));
    expect(excerpt).toContain('error: the only failure');
    expect(excerpt).not.toContain('skipped');
  });

  test('falls back to the last lines when nothing matches', () => {
    const log = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const excerpt = errorExcerpt(log);
    expect(excerpt).toContain('(no known error pattern; last lines)');
    expect(excerpt).toContain('line 49');
    expect(excerpt).not.toContain('line 0');
  });

  test('handles empty input and CRLF', () => {
    expect(errorExcerpt('')).toBe('');
    expect(errorExcerpt('a\r\nerror: boom\r\nc')).toContain('error: boom');
  });

  test('honours a custom window and tail', () => {
    const log = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const excerpt = errorExcerpt(`${log}\nerror: boom`, { window: 2, tail: 1 });
    expect(excerpt).toContain('error: boom');
    expect(excerpt).toContain('line 39');
  });
});

describe('slugify', () => {
  test('makes a safe file name', () => {
    expect(slugify('Build tester')).toBe('build-tester');
    expect(slugify('npm run test:unit')).toBe('npm-run-test-unit');
    expect(slugify('  --features test-driver  ')).toBe('features-test-driver');
  });

  test('never returns an empty slug', () => {
    expect(slugify('')).toBe('step');
    expect(slugify('///')).toBe('step');
  });
});
