import { describe, expect, test } from 'vitest';
import {
  buildReport,
  describeRuntime,
  MARKER,
  parseJUnit,
  readRuntimeFromLog,
  renderReportFromDir,
} from './report.mjs';

const step = (name, exitCode, extra = {}) => ({
  name,
  slug: name.toLowerCase().replaceAll(/\W+/gu, '-'),
  exitCode,
  durationMs: 12_000,
  logPath: `ci-out/logs/native-macos-15/${name.toLowerCase()}.log`,
  excerpt: null,
  ...extra,
});

const META = {
  sha: 'abcdef1234567890',
  runUrl: 'https://github.com/streetwriters/react-native-gpui/actions/runs/1',
  repo: 'streetwriters/react-native-gpui',
  pr: 42,
  localHash: '6c36c5be5b780521b3427010da6a6850eb3224cb04471588c500bf1a5ff23aa2',
  pinnedHash:
    'ed646e355e0d63df0a7ca2ff5c923dc9a306dab2a69e512701ad365f926c3898',
  cppChanged: false,
};

describe('buildReport all green', () => {
  const report = buildReport({
    meta: META,
    reports: [
      {
        job: 'lint',
        steps: [step('Unit tests', 0), step('Lint', 0)],
      },
      {
        job: 'native-macos-15',
        steps: [step('Rust tests', 0), step('Build tester', 0), step('E2E', 0)],
      },
    ],
    runtimeByJob: { 'native-macos-15': { kind: 'prebuilt', version: '0.0.2' } },
  });

  test('starts with the marker comment', () => {
    expect(report.startsWith(MARKER)).toBe(true);
  });

  test('shows a passing verdict, the short SHA and the run link', () => {
    expect(report).toContain('✅ **CI passed**');
    expect(report).toContain('`abcdef1`');
    expect(report).toContain('actions/runs/1');
  });

  test('has one row per job and a cell per stage', () => {
    expect(report).toMatch(
      /\| job \| unit \| rust \| build \| e2e \| clean-install \| package \|/u,
    );
    expect(report).toMatch(/\| lint \| ✅ 12s \| ⏭ \| ⏭ \| ⏭ \| ⏭ \| ⏭ \|/u);
    expect(report).toMatch(
      /\| native-macos-15 \| ⏭ \| ✅ 12s \| ✅ 12s \| ✅ 12s \| ⏭ \| ⏭ \|/u,
    );
  });

  test('reports the prebuilt runtime', () => {
    expect(report).toContain('- native-macos-15: prebuilt 0.0.2');
  });

  test('has no failure section', () => {
    expect(report).not.toContain('**Failures**');
    expect(report).not.toContain('<details>');
  });
});

describe('buildReport with a failed e2e test', () => {
  const report = buildReport({
    meta: META,
    reports: [
      {
        job: 'native-ubuntu-24.04',
        steps: [
          step('Build tester', 0),
          step('E2E', 1, {
            excerpt:
              'FAIL  e2e/gestures.test.ts > pan responder\nAssertionError: expected 2 to be 3',
          }),
        ],
      },
    ],
    junitFailures: [
      {
        name: 'e2e/gestures.test.ts > pan responder',
        message: 'AssertionError: expected 2 to be 3',
      },
    ],
    runtimeByJob: {
      'native-ubuntu-24.04': {
        kind: 'source',
        reason:
          'local C++ inputs hash to 6c36c5be5b780521b3427010da6a6850eb3224cb04471588c500bf1a5ff23aa2, the pinned prebuilt was built from ed646e355e0d63df0a7ca2ff5c923dc9a306dab2a69e512701ad365f926c3898',
      },
    },
  });

  test('shows a failing verdict and the failing cell', () => {
    expect(report).toContain('❌ **CI failed**');
    expect(report).toMatch(
      /\| native-ubuntu-24\.04 \| ⏭ \| ⏭ \| ✅ 12s \| ❌ 12s \|/u,
    );
  });

  test('names the failing test and its first message line', () => {
    expect(report).toContain(
      '- `e2e/gestures.test.ts > pan responder`: AssertionError: expected 2 to be 3',
    );
  });

  test('has a details block with the excerpt, the log and the artifact', () => {
    expect(report).toContain(
      '<details><summary>❌ native-ubuntu-24.04 / E2E</summary>',
    );
    expect(report).toContain('```');
    expect(report).toContain('AssertionError: expected 2 to be 3');
    expect(report).toContain('Artifact: `logs-native-ubuntu-24.04`');
  });

  test('describes the source build with the short hashes', () => {
    expect(report).toContain(
      '- native-ubuntu-24.04: built from source: C++ inputs changed (local `6c36c5be` vs pinned `ed646e35`)',
    );
  });
});

describe('buildReport source fallback with another reason', () => {
  test('prints the reason from the fallback line verbatim', () => {
    const description = describeRuntime(
      {
        kind: 'source',
        reason: 'prebuilt runtime was built for react-native 0.87.0',
      },
      META,
    );
    expect(description).toBe(
      'built from source: prebuilt runtime was built for react-native 0.87.0',
    );
  });

  test('adds the cpp_changed note when the inputs changed', () => {
    const report = buildReport({
      meta: { ...META, cppChanged: true },
      reports: [{ job: 'lint', steps: [step('Lint', 0)] }],
    });
    expect(report).toContain('This PR changes the prebuilt C++ inputs.');
    expect(report).toContain('dispatch prebuilt-binaries.yml');
  });

  test('lists the C++ inputs a PR changed, capped', () => {
    const changedCppInputs = Array.from(
      { length: 25 },
      (_, index) => `ReactGpui/rn-gpui-sys/cpp/File${index}.cpp`,
    );
    const report = buildReport({
      meta: { ...META, cppChanged: true, changedCppInputs },
      reports: [{ job: 'lint', steps: [step('Lint', 0)] }],
    });
    expect(report).toContain('**C++ inputs changed**');
    expect(report).toContain('`ReactGpui/rn-gpui-sys/cpp/File0.cpp`');
    expect(report).toContain('…and 5 more');
    expect(report).not.toContain('File20.cpp');
  });

  test('reports the core boundary and the core-private uses', () => {
    const report = buildReport({
      meta: {
        ...META,
        coreBoundary: {
          hitCount: 2,
          hits: [
            { file: 'packages/core/a.rs', line: 3 },
            { file: 'packages/core/b.cpp', line: 9 },
          ],
          corePrivateCount: 1,
          corePrivate: [{ file: 'packages/core/c.rs', line: 12, reason: 'x' }],
        },
      },
      reports: [{ job: 'lint', steps: [step('Lint', 0)] }],
    });
    expect(report).toContain('**Core boundary**');
    expect(report).toContain('2 place(s) still name a library');
    expect(report).toContain('`packages/core/a.rs:3`');
    expect(report).toContain('`// core-private:` uses: 1');
  });

  test('says so when core names no library', () => {
    const report = buildReport({
      meta: {
        ...META,
        coreBoundary: {
          hitCount: 0,
          hits: [],
          corePrivateCount: 0,
          corePrivate: [],
        },
      },
      reports: [{ job: 'lint', steps: [step('Lint', 0)] }],
    });
    expect(report).toContain('- core names no library');
    expect(report).toContain('`// core-private:` uses: 0');
  });
});

describe('truncation', () => {
  test('keeps an oversized excerpt under the limit and says so', () => {
    // Long enough to exceed MAX_BODY on its own, so the excerpt must be cut.
    const huge = Array.from(
      { length: 12_000 },
      (_, i) => `line ${i} ${'x'.repeat(20)}`,
    ).join('\n');
    expect(huge.length).toBeGreaterThan(60_000);
    const report = buildReport({
      meta: META,
      reports: [
        {
          job: 'native-windows-2022',
          steps: [step('Build tester', 1, { excerpt: huge })],
        },
      ],
    });
    expect(report.length).toBeLessThanOrEqual(60_000);
    expect(report).toContain('truncated');
    expect(report).toContain('logs-native-windows-2022');
    expect(report).toContain('<details>');
  });

  test('a small excerpt is not marked truncated', () => {
    const report = buildReport({
      meta: META,
      reports: [
        {
          job: 'lint',
          steps: [step('Lint', 1, { excerpt: 'npm ERR! code 1' })],
        },
      ],
    });
    expect(report).not.toContain('truncated');
  });
});

describe('readRuntimeFromLog', () => {
  test('reads the prebuilt line', () => {
    expect(
      readRuntimeFromLog(
        'warning: rn-gpui-sys: using prebuilt runtime 0.0.2 (aarch64-apple-darwin)',
      ),
    ).toEqual({ kind: 'prebuilt', version: '0.0.2' });
  });

  test('reads the source fallback line', () => {
    expect(
      readRuntimeFromLog(
        'warning: rn-gpui-sys: no prebuilt runtime (local C++ inputs hash to abc, the pinned prebuilt was built from def); building from source',
      ),
    ).toEqual({
      kind: 'source',
      reason:
        'local C++ inputs hash to abc, the pinned prebuilt was built from def',
    });
  });

  test('returns null when the build said neither', () => {
    expect(readRuntimeFromLog('Compiling foo v1')).toBe(null);
  });
});

describe('parseJUnit', () => {
  test('collects failing cases with the first message line only', () => {
    const xml = `<?xml version="1.0"?>
<testsuites><testsuite name="unit">
  <testcase classname="core" name="resolves paths"/>
  <testcase classname="cli" name="autolinks">
    <failure message="AssertionError: expected 1 to be 2&#10;at foo.ts:1:1">stack</failure>
  </testcase>
</testsuite></testsuites>`;
    expect(parseJUnit(xml)).toEqual([
      {
        name: 'cli > autolinks',
        message: 'AssertionError: expected 1 to be 2',
      },
    ]);
  });

  test('ignores passing cases', () => {
    const xml = '<testsuite><testcase classname="a" name="b"/></testsuite>';
    expect(parseJUnit(xml)).toEqual([]);
  });
});

describe('the fixture directories', () => {
  const fixture = name =>
    renderReportFromDir(
      new URL(`./fixtures/${name}`, import.meta.url).pathname,
    );

  test('all-green renders a passing report with every row', () => {
    const report = fixture('all-green');
    expect(report.startsWith(MARKER)).toBe(true);
    expect(report).toContain('✅ **CI passed**');
    expect(report).toContain('- native-macos-15: prebuilt 0.0.2');
    expect(report).not.toContain('<details>');
  });

  // The workflow used to upload a meta.json it never wrote, so every field was
  // missing: the comment said "unknown commit" and ci-comment.yml exited at its
  // "names no pull request" guard without ever updating the PR comment.
  test('the meta the workflow writes reaches the report', () => {
    const report = fixture('all-green');
    expect(report).toContain('`abcdef1`');
    expect(report).not.toContain('unknown commit');
    expect(fixture('failed')).not.toContain('unknown commit');
  });

  test('failed renders the excerpt, the test name and the cpp note', () => {
    const report = fixture('failed');
    expect(report).toContain('❌ **CI failed**');
    expect(report).toContain('AssertionError: expected 2 to be 3');
    expect(report).toContain('pan responder > reports the final translation');
    expect(report).toContain('local `6c36c5be` vs pinned `ed646e35`');
    expect(report).toContain('Artifact: `logs-native-ubuntu-24.04`');
  });

  test('source-build names the fallback reason', () => {
    expect(fixture('source-build')).toContain(
      'built from source: prebuilt runtime was built for react-native 0.87.0',
    );
  });

  test('oversized stays under the body limit and says it was cut', () => {
    const report = fixture('oversized');
    expect(report.length).toBeLessThanOrEqual(60_000);
    expect(report).toContain('excerpt truncated');
  });
});
