// Builds the release tester with the benchmark scenarios (bench/) and keeps a
// copy under .local/bench/<name>, for scripts/bench-memory.mjs.
//
//   node scripts/bench.mjs prepare <name>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(projectRoot, '../..');
const outRoot =
  process.env.RN_GPUI_BENCH_DIR ?? path.join(repoRoot, '.local/bench');
const require = createRequire(import.meta.url);

const rendererDir = renderer => path.join(outRoot, renderer);

function prepare(renderer) {
  const env = { ...process.env, RN_GPUI_BUILD_FROM_SOURCE: '1' };
  const npx = (...rest) =>
    execFileSync('npx', ['--no-install', 'react-native', ...rest], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    });
  npx(
    'run-desktop',
    '--release',
    '--features',
    'test-driver',
    '--no-launch',
    '--entry-file',
    'bench/entry.ts',
  );
  const dir = rendererDir(renderer);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const bundle = path.join(dir, 'bench.bundle');
  npx(
    'bundle',
    '--platform',
    'desktop',
    '--entry-file',
    'bench/entry.ts',
    '--bundle-output',
    bundle,
    '--assets-dest',
    path.join(dir, 'assets'),
    '--dev',
    'false',
    '--minify',
    'true',
    '--config',
    'desktop/metro.config.js',
    '--reset-cache',
  );
  const engine = require(
    path.join(repoRoot, 'packages/hermes/desktop/bundle.js'),
  );
  engine.compile({ input: bundle, output: `${bundle}.hbc`, dev: false });
  fs.renameSync(`${bundle}.hbc`, bundle);
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--manifest-path',
        path.join(projectRoot, 'desktop/Cargo.toml'),
        '--no-deps',
        '--format-version',
        '1',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    ),
  );
  // The copy must not load a libjsi rebuilt later in the target directory,
  // so that rpath goes and the library sits in ../Frameworks.
  const binary = path.join(
    metadata.target_directory,
    'release',
    'rn-gpui-tester',
  );
  const executable = path.join(dir, 'bin', 'rn-gpui-tester');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Frameworks'), { recursive: true });
  fs.copyFileSync(binary, executable);
  const rpaths = [
    ...execFileSync('otool', ['-l', executable], { encoding: 'utf8' }).matchAll(
      /path (\/\S+) \(offset/gu,
    ),
  ].map(match => match[1]);
  for (const rpath of rpaths.filter(entry =>
    entry.startsWith(metadata.target_directory),
  )) {
    for (const file of fs
      .readdirSync(rpath)
      .filter(name => name.endsWith('.dylib'))) {
      fs.copyFileSync(
        path.join(rpath, file),
        path.join(dir, 'Frameworks', file),
      );
    }
    execFileSync('install_name_tool', ['-delete_rpath', rpath, executable]);
  }
  execFileSync('codesign', ['--force', '--sign', '-', executable]);
  console.log(`[bench] prepared ${renderer} in ${dir}`);
}

const [command, target] = process.argv.slice(2);
if (command === 'prepare' && target) prepare(target);
else {
  console.error('usage: bench.mjs prepare <name>');
  process.exit(1);
}
