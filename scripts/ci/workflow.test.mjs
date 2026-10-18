import { readFileSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { describe, expect, test } from 'vitest';

const workflow = () =>
  readFileSync(
    path.resolve(__dirname, '../../.github/workflows/ci.yml'),
    'utf8',
  );

/// The `plan` job's `Detect what changed` step, up to the next job, with its
/// comment lines removed: the workflow explains the `every` mistake in prose and
/// a test that read the comments would match its own explanation.
function detectStep(source) {
  const start = source.indexOf('Detect what changed');
  expect(start).toBeGreaterThan(-1);
  return source
    .slice(start, source.indexOf('\n  lint:', start))
    .split('\n')
    .filter(line => !/^\s*#/u.test(line))
    .join('\n');
}

/**
 * The globs the workflow's `docs_only` filter carries, read out of the YAML so
 * this test cannot drift from it.
 */
function documentationGlobs(step) {
  const filter = step.slice(step.indexOf('docs_only:'));
  const lines = filter.slice(0, filter.indexOf('all:')).split('\n');
  return lines
    .map(line => line.match(/^\s+-\s+'([^']+)'\s*$/u)?.[1])
    .filter(Boolean);
}

const matches = globs => {
  const matchers = globs.map(glob => picomatch(glob, { dot: true }));
  return file => matchers.some(matcher => matcher(file));
};

/** The decision the workflow's shell step makes, from the two counts. */
function skipsNative(files, isDocumentation) {
  const docs = files.filter(isDocumentation).length;
  const all = files.length;
  return all > 0 && docs === all;
}

// `docs_only` decides whether the native and clean-install matrices run at all.
//
// It has been wrong twice. As a documentation list under the default quantifier
// it matched if *any* changed file was a README, so a PR that also changed C++
// skipped every native job. As a list of code extensions it missed file types —
// Hermes `.patch`, `.plist`, `.ttf`, `.png`, `.xml`, plain `.txt` — so a PR
// changing only one of those skipped them too.
//
// `predicate-quantifier: 'every'` looks like the fix but is not: the action
// applies it to the patterns *within one filter*, against one file, so a filter
// listing both `**/*.md` and `docs/**` matches nothing. The workflow compares a
// documentation count against a count of everything instead, and these tests
// hold that behaviour by simulating it.
describe('the plan job decides when native work can be skipped', () => {
  test('the filter uses counts, not a quantifier that would match nothing', () => {
    const step = detectStep(workflow());
    // `predicate-quantifier: every` applies to the patterns within one filter
    // against one file. With `**/*.md` and `docs/**` in the same list no file
    // matches both, so the filter would never match and the native jobs would
    // never be skipped. The behaviour is expressed as a count instead.
    expect(step).not.toMatch(/predicate-quantifier:\s*'every'/);
    expect(step).not.toMatch(/predicate-quantifier:\s*"every"/);
  });

  test('documentation is a list of what it is, not a list of code extensions', () => {
    const step = detectStep(workflow());
    expect(step).not.toMatch(/^\s+code:\s*$/mu);
    expect(documentationGlobs(step).length).toBeGreaterThan(0);
    expect(step).toMatch(/docs_only_count/);
    expect(step).toMatch(/all_count/);
  });

  test('a documentation-only change skips the native jobs', () => {
    const globs = documentationGlobs(detectStep(workflow()));
    const isDocumentation = matches(globs);
    expect(skipsNative(['README.md'], isDocumentation)).toBe(true);
    expect(skipsNative(['docs/guide.md', 'README.md'], isDocumentation)).toBe(
      true,
    );
  });

  test('a change to code and a README does not skip the native jobs', () => {
    const globs = documentationGlobs(detectStep(workflow()));
    const isDocumentation = matches(globs);
    expect(skipsNative(['README.md', 'src/a.cpp'], isDocumentation)).toBe(
      false,
    );
  });

  // The file types a code-extension list got wrong. Under a count of
  // documentation, each one forces the native jobs without being listed
  // anywhere at all.
  test.each([
    ['a Hermes patch', 'packages/hermes/patches/hermes.patch'],
    ['a plist', 'packages/rn-gpui-tester/desktop/Info.plist'],
    ['a plain text list', 'packages/hermes/desktop/node-api-exports.txt'],
    ['a font', 'packages/rn-gpui-tester/assets/fonts/Inter.ttf'],
    ['an image', 'packages/rn-gpui-tester/assets/icon.png'],
    ['an xml manifest', 'packages/rn-gpui-tester/desktop/app.xml'],
    ['a gitignore', '.gitignore'],
    ['an editorconfig', '.editorconfig'],
    ['a workflow', '.github/workflows/ci.yml'],
  ])('%s is not documentation', (_name, file) => {
    const globs = documentationGlobs(detectStep(workflow()));
    expect(skipsNative([file], matches(globs))).toBe(false);
  });

  test('a push with no changed files does not skip anything', () => {
    const globs = documentationGlobs(detectStep(workflow()));
    expect(skipsNative([], matches(globs))).toBe(false);
  });
});
