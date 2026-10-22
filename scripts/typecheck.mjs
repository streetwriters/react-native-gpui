// Type-checks every TypeScript project in the repo. Runs them all, so one
// failure does not hide another, and exits non-zero if any failed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(
  root,
  'node_modules/.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);
// `packages/testing` is built, not only checked, and goes first: the tester
// reads its types from `dist`, which is gitignored, so a fresh checkout has none
// and a local one can be stale.
const projects = [
  ['packages/testing'],
  ['tsconfig.json', '--noEmit'],
  ['tsconfig.node.json', '--noEmit'],
  ['packages/core', '--noEmit'],
  ['packages/rn-gpui-tester', '--noEmit'],
];

const failed = [];
for (const [project, ...flags] of projects) {
  const result = spawnSync(tsc, ['-p', project, ...flags], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) failed.push(project);
}

if (failed.length > 0) {
  console.error(`typecheck failed: ${failed.join(', ')}`);
  process.exit(1);
}
