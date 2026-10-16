import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ALLOW_LIST,
  classifyHits,
  exitCodeFor,
  formatHits,
  formatJson,
  formatReportText,
  readModuleNames,
  scanCoreBoundary,
} from './check-core-boundary.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true });
});

/// A throwaway checkout: `packages/core/` and `modules/` are all the scan
/// reads, so a fixture tree exercises the same code path CI does.
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-boundary-'));
  roots.push(root);
  for (const [rel, contents] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

const CORE = 'packages/core/ReactGpui/rn-gpui/src';

describe('a library name in core', () => {
  test('fails and prints file:line: <match>', () => {
    const root = fixture({
      [`${CORE}/bad.rs`]: 'let view = rnscreens_view(1);\n',
    });
    const result = scanCoreBoundary({ root });
    expect(result.hits).toEqual([
      {
        file: `${CORE}/bad.rs`,
        line: 1,
        match: 'screens',
        pattern: 'screens',
      },
    ]);
    expect(exitCodeFor(result)).toBe(1);
    expect(formatHits(result.hits)).toEqual([`${CORE}/bad.rs:1: screens`]);
    expect(formatReportText(result)).toContain(
      'core boundary: 1 hit(s), core names a library',
    );
  });

  test('reads the deny list from modules/*/package.json at run time', () => {
    const root = fixture({
      'modules/widget/package.json': JSON.stringify({
        name: '@example/widget',
      }),
      [`${CORE}/uses.rs`]: 'use @example/widget;\n',
    });
    expect(readModuleNames(root)).toEqual(['@example/widget']);
    const result = scanCoreBoundary({ root });
    expect(result.hits).toEqual([
      {
        file: `${CORE}/uses.rs`,
        line: 1,
        match: '@example/widget',
        pattern: '@example/widget',
      },
    ]);
    expect(exitCodeFor(result)).toBe(1);
  });

  test('reports an identifier once, not once per pattern', () => {
    const root = fixture({
      [`${CORE}/one.rs`]: 'if component == "RNSScreen" {\n',
    });
    expect(scanCoreBoundary({ root }).hits).toEqual([
      {
        file: `${CORE}/one.rs`,
        line: 1,
        match: 'RNS',
        pattern: 'RNS',
      },
    ]);
  });
});

describe('the allow list', () => {
  test('covers RN role and type names', () => {
    const root = fixture({
      [`${CORE}/roles.rs`]:
        'match role {\n' +
        '    "drawerlayout" => Role::Pane,\n' +
        '}\n' +
        'fn onPress(event: GestureResponderEvent) {}\n' +
        'let view = SafeAreaView::new();\n' +
        'layoutableShadowNode.setSize(stateData.screenSize);\n',
    });
    expect(scanCoreBoundary({ root }).hits).toEqual([]);
    expect(exitCodeFor(scanCoreBoundary({ root }))).toBe(0);
  });

  test("covers core's own screenshot flags", () => {
    const root = fixture({
      [`${CORE}/capture.rs`]:
        'let screenshot = env("RN_GPUI_SCREENSHOT");\n' +
        'let screenshots = env("RN_GPUI_SCREENSHOTS");\n' +
        'let screens = NSScreen::screens();\n',
    });
    expect(scanCoreBoundary({ root }).hits).toEqual([]);
  });

  test('an allowed name does not hide the library API around it', () => {
    const root = fixture({
      [`${CORE}/props.rs`]:
        'let json = svg_props_json(&view);\n' +
        'let document = svg_document(&view);\n' +
        'gpuiModuleHooks().screensOp(shadowView, op);\n' +
        'log::info!("[screens] nested stack tags={nested:?}");\n',
    });
    expect(scanCoreBoundary({ root }).hits.map(hit => hit.match)).toEqual([
      'svg',
      'svg',
      'screens',
      'screens',
    ]);
  });

  test('names why each entry is not a library reference', () => {
    expect(ALLOW_LIST).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'drawerlayout' }),
      ]),
    );
    expect(ALLOW_LIST).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'GestureResponderEvent' }),
      ]),
    );
  });
});

describe('skipped files', () => {
  test('tests, Markdown and Cargo.lock are not scanned', () => {
    const root = fixture({
      [`${CORE}/tests/svg.rs`]: 'rnscreens();\n',
      [`${CORE}/bad.test.mjs`]: 'rnscreens();\n',
      [`${CORE}/bad_test.cpp`]: 'rnscreens();\n',
      [`${CORE}/TestScreens.cpp`]: 'rnscreens();\n',
      [`${CORE}/notes.md`]: 'rnscreens();\n',
      [`${CORE}/Cargo.lock`]: 'name = "react-native-screens"\n',
    });
    expect(scanCoreBoundary({ root }).hits).toEqual([]);
  });

  test('a shipping source named test_driver is scanned', () => {
    const root = fixture({
      [`${CORE}/test_driver.rs`]: 'let frames = worklet_frames();\n',
    });
    expect(scanCoreBoundary({ root }).hits).toHaveLength(1);
  });

  test('generated build output is not scanned', () => {
    const root = fixture({
      'packages/core/build/out.rnsvg.cpp': 'rnscreens();\n',
      'packages/core/desktop/target/out.rs': 'rnscreens();\n',
      'packages/core/node_modules/pkg/out.js': 'rnscreens();\n',
    });
    expect(scanCoreBoundary({ root }).hits).toEqual([]);
  });
});

describe('core-private comments', () => {
  test('lists the file, line and reason', () => {
    const root = fixture({
      [`${CORE}/private.rs`]:
        '// core-private: reaches the store to flush the frame\n' +
        'store.flush();\n' +
        'let clean = true; // core-private: needs the raw view tag\n',
    });
    expect(scanCoreBoundary({ root }).corePrivate).toEqual([
      {
        file: `${CORE}/private.rs`,
        line: 1,
        reason: 'reaches the store to flush the frame',
      },
      {
        file: `${CORE}/private.rs`,
        line: 3,
        reason: 'needs the raw view tag',
      },
    ]);
    expect(formatReportText(scanCoreBoundary({ root }))).toContain(
      'core-private: 2 comment(s)',
    );
  });

  test('says none when there are none', () => {
    const root = fixture({ [`${CORE}/clean.rs`]: 'let clean = true;\n' });
    expect(formatReportText(scanCoreBoundary({ root }))).toContain(
      'core-private: none',
    );
  });
});

describe('--json', () => {
  test('prints the hits and the core-private list', () => {
    const root = fixture({
      [`${CORE}/bad.rs`]: 'rnscreens();\n',
      [`${CORE}/private.rs`]: '// core-private: the raw tag\n',
    });
    const parsed = JSON.parse(formatJson(scanCoreBoundary({ root })));
    expect(parsed.hitCount).toBe(1);
    expect(parsed.corePrivateCount).toBe(1);
    expect(parsed.hits[0]).toMatchObject({ file: `${CORE}/bad.rs`, line: 1 });
    expect(parsed.corePrivate[0]).toMatchObject({
      file: `${CORE}/private.rs`,
      reason: 'the raw tag',
    });
  });
});

describe('the pending screens baseline', () => {
  const pending = {
    patterns: ['screens'],
    maxPerFile: { 'packages/core/src/store.rs': 2 },
  };
  const hit = (file, pattern = 'screens') => ({
    file,
    line: 1,
    match: pattern,
    pattern,
  });

  test('tolerates hits within the per-file baseline', () => {
    const hits = [
      hit('packages/core/src/store.rs'),
      hit('packages/core/src/store.rs'),
    ];
    expect(classifyHits(hits, pending).failing).toEqual([]);
    expect(exitCodeFor({ hits }, pending)).toBe(0);
  });

  test('fails a file whose pending count grows', () => {
    const hits = [1, 2, 3].map(() => hit('packages/core/src/store.rs'));
    expect(exitCodeFor({ hits }, pending)).toBe(1);
  });

  test('fails a pending pattern in a file outside the baseline', () => {
    expect(
      exitCodeFor({ hits: [hit('packages/core/src/other.rs')] }, pending),
    ).toBe(1);
  });

  test('fails any other library even in a baseline file', () => {
    const hits = [hit('packages/core/src/store.rs', 'svg')];
    expect(exitCodeFor({ hits }, pending)).toBe(1);
  });
});
