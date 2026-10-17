import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const workflow = () =>
  readFileSync(
    path.resolve(__dirname, '../../.github/workflows/ci.yml'),
    'utf8',
  );

// `docs_only` decides whether the native and clean-install matrices run at all.
// It used to be a list of documentation globs, which paths-filter reports as
// true for any PR that touched a README — so a PR that changed code *and* a
// README skipped every native job. It now means "no code changed", and this
// checks that it keeps meaning that.
describe('the plan job decides when native work can be skipped', () => {
  test('docs_only comes from a code filter, not from documentation globs', () => {
    const source = workflow();
    expect(source).toMatch(/steps\.changes\.outputs\.code/);
    expect(source).toMatch(/steps\.docs\.outputs\.docs_only/);
    // A filter named `docs_only` listing documentation paths is the bug.
    expect(source).not.toMatch(/^\s+docs_only:\s*$/mu);
  });

  test('every file type that can change behaviour counts as code', () => {
    const source = workflow();
    const codeBlock = source.slice(
      source.indexOf('code:'),
      source.indexOf('lint:', source.indexOf('code:')),
    );
    for (const glob of [
      '**/*.rs',
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.json',
      '**/*.cpp',
      '**/*.h',
      '**/CMakeLists.txt',
      '**/Cargo.toml',
      '**/Cargo.lock',
      '**/build.rs',
      '.github/workflows/**',
    ]) {
      expect(codeBlock).toContain(glob);
    }
  });
});
