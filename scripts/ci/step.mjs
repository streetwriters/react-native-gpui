#!/usr/bin/env node
// Runs one CI step, tees its output, and records the result for the report.
//
//   node scripts/ci/step.mjs --job <job> --name "<step>" -- <command...>
//
// Every long CI step goes through here so that a failure leaves one small
// excerpt in ci-out/reports/<job>.json instead of forcing a reader to open a
// multi-megabyte log. Node built-ins only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

export const OUTPUT_ROOT = path.join(repoRoot, 'ci-out');

/// The first line matching any of these marks where the excerpt starts. Each
/// family is one of the toolchains the CI matrix runs, so the excerpt covers
/// every failure the workflows can produce.
export const ERROR_PATTERNS = [
  { family: 'rustc', pattern: /error\[E\d+\]/u },
  { family: 'rustc', pattern: /\berror:/u },
  { family: 'cmake', pattern: /CMake Error/u },
  { family: 'msvc', pattern: /\berror C\d+/u },
  { family: 'msvc', pattern: /\berror LNK\d+/u },
  { family: 'msvc', pattern: /\bfatal error\b/u },
  { family: 'linker', pattern: /\bld:/u },
  { family: 'linker', pattern: /undefined reference/u },
  { family: 'linker', pattern: /Undefined symbols/u },
  { family: 'vitest', pattern: /FAIL /u },
  { family: 'vitest', pattern: /AssertionError/u },
  { family: 'npm', pattern: /npm ERR!/u },
  { family: 'npm', pattern: /npm error/u },
  { family: 'panic', pattern: /panicked at/u },
  { family: 'github', pattern: /##\[error\]/u },
];

/// A filesystem- and artifact-safe name. Used for the log file and for the
/// per-job report, so the two always agree.
export function slugify(value) {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  return slug || 'step';
}

/// The failure excerpt: up to `window` lines around the first line matching an
/// error pattern, plus the last `tail` lines. Overlapping regions are merged so
/// no line is printed twice, and a skipped-lines marker says where the gap is.
/// Pure, so the test can feed it sample logs.
export function errorExcerpt(logText, { window = 40, tail = 20 } = {}) {
  const lines = logText.split(/\r?\n/u);
  // A trailing newline leaves one empty final element; it is not a log line.
  if (lines.length > 0 && lines.at(-1) === '') lines.pop();
  if (lines.length === 0) return '';

  const match = lines.findIndex(line =>
    ERROR_PATTERNS.some(({ pattern }) => pattern.test(line)),
  );

  const wanted = new Set();
  if (match !== -1) {
    let start = Math.max(0, match - Math.floor(window / 2));
    const end = Math.min(lines.length, start + window);
    start = Math.max(0, end - window);
    for (let index = start; index < end; index += 1) wanted.add(index);
  }
  const tailStart = Math.max(0, lines.length - tail);
  for (let index = tailStart; index < lines.length; index += 1)
    wanted.add(index);

  const indices = [...wanted].sort((a, b) => a - b);
  const out = [];
  if (match === -1) out.push('(no known error pattern; last lines)');
  let previous = null;
  for (const index of indices) {
    if (previous !== null && index > previous + 1) {
      out.push(`... ${index - previous - 1} line(s) skipped ...`);
    }
    out.push(lines[index]);
    previous = index;
  }
  return out.join('\n');
}

function quoteForShell(value) {
  return /\s/u.test(value) ? `"${value}"` : value;
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator === -1)
    throw new Error('expected `--` before the command to run');
  const options = argv.slice(0, separator);
  const command = argv.slice(separator + 1);
  const parsed = { job: null, name: null };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--job') parsed.job = options[++index];
    else if (option === '--name') parsed.name = options[++index];
    else throw new Error(`Unknown argument: ${option}`);
  }
  if (!parsed.job) throw new Error('--job is required');
  if (!parsed.name) throw new Error('--name is required');
  if (command.length === 0) throw new Error('no command given after `--`');
  return { ...parsed, command };
}

function appendReport(reportPath, job, step) {
  let report = { job, steps: [] };
  try {
    const existing = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (Array.isArray(existing.steps)) report = { job, steps: existing.steps };
  } catch {}
  report.steps.push(step);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function runCommand(command, logPath) {
  return new Promise(resolve => {
    const [program, ...args] = command;
    // npm and npx are `.cmd` shims on Windows, which spawn cannot execute
    // without a shell. A shell joins the arguments, so quote the ones with
    // spaces first, the same way the CLI's desktop runner does.
    const shell = process.platform === 'win32';
    const child = spawn(program, shell ? args.map(quoteForShell) : args, {
      cwd: repoRoot,
      shell,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const log = fs.createWriteStream(logPath);
    const forward = (stream, sink) => {
      stream.on('data', chunk => {
        sink.write(chunk);
        log.write(chunk);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    const finish = (code, signal) => {
      log.end(() => resolve({ code, signal }));
    };
    child.on('error', error => {
      log.write(`${error.message}\n`);
      finish(1, null);
    });
    child.on('close', finish);
  });
}

async function main() {
  const { job, name, command } = parseArgs(process.argv.slice(2));
  const jobSlug = slugify(job);
  const stepSlug = slugify(name);
  const logPath = path.join(OUTPUT_ROOT, 'logs', jobSlug, `${stepSlug}.log`);
  const reportPath = path.join(OUTPUT_ROOT, 'reports', `${jobSlug}.json`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  console.log(`::group::${job} / ${name}`);
  const started = Date.now();
  const { code, signal } = await runCommand(command, logPath);
  const durationMs = Date.now() - started;
  const exitCode = code ?? (signal ? 1 : 1);
  console.log('::endgroup::');

  let excerpt = null;
  if (exitCode !== 0) {
    excerpt = errorExcerpt(fs.readFileSync(logPath, 'utf8'));
    console.log(`::error::${job} / ${name} failed (exit ${exitCode})`);
  }
  appendReport(reportPath, job, {
    name,
    slug: stepSlug,
    exitCode,
    durationMs,
    logPath: path.relative(repoRoot, logPath),
    excerpt,
  });
  process.exitCode = exitCode;
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
    await main();
  } catch (error) {
    console.error(`step: ${error.message}`);
    process.exitCode = 2;
  }
}
