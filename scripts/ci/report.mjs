#!/usr/bin/env node
// Renders the CI report from the artifacts the jobs leave in ci-out/.
//
//   node scripts/ci/report.mjs [ci-out-dir]
//
// Reads every ci-out/reports/*.json, the ci-out/meta.json the workflow writes,
// and any JUnit XML under ci-out/junit/, then prints Markdown to stdout. The
// first line is the marker comment ci-comment.yml searches for. Node built-ins
// only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

export const MARKER = '<!-- rn-gpui-ci-report -->';

/// GitHub rejects a comment body over 65,536 characters; the plan asks for a
/// margin below that.
export const MAX_BODY = 60_000;
const MAX_BOUNDARY_LINES = 20;

/// The stage columns, in order. A step is assigned by the first pattern its
/// name matches, so the workflow only has to name its steps naturally.
export const STAGES = [
  { key: 'unit', label: 'unit', pattern: /\bunit\b|vitest/i },
  { key: 'rust', label: 'rust', pattern: /\brust\b|cargo/i },
  { key: 'build', label: 'build', pattern: /\bbuild\b|compile/i },
  { key: 'e2e', label: 'e2e', pattern: /\be2e\b|end-to-end/i },
  { key: 'clean-install', label: 'clean-install', pattern: /clean.?install/i },
  { key: 'package', label: 'package', pattern: /\bpackage\b|packager/i },
];

/// The A3 line the Rust build prints, so the report can say which C++ runtime
/// each OS linked.
export function readRuntimeFromLog(logText) {
  const prebuilt = /using prebuilt runtime ([^\s(]+)/u.exec(logText);
  if (prebuilt) return { kind: 'prebuilt', version: prebuilt[1] };
  const source = /no prebuilt runtime \(([^)]*)\)/u.exec(logText);
  if (source) return { kind: 'source', reason: source[1].trim() };
  return null;
}

/// `built from source: C++ inputs changed (local \`abc\` vs pinned \`def\`)` when
/// the reason is the hash mismatch, otherwise the reason verbatim.
export function describeRuntime(runtime, meta) {
  if (!runtime) return null;
  if (runtime.kind === 'prebuilt') return `prebuilt ${runtime.version}`;
  const hashMismatch = /local C\+\+ inputs hash to/u.test(runtime.reason);
  if (hashMismatch && meta?.localHash && meta?.pinnedHash) {
    return (
      'built from source: C++ inputs changed ' +
      `(local \`${meta.localHash.slice(0, 8)}\` vs pinned \`${meta.pinnedHash.slice(0, 8)}\`)`
    );
  }
  return `built from source: ${runtime.reason}`;
}

function stageFor(stepName) {
  return STAGES.find(stage => stage.pattern.test(stepName))?.key ?? null;
}

/// Minimal JUnit reader: the failing test names and the first line of their
/// message. Avoids an XML dependency for one shape of file. A passing case is
/// self-closing (`<testcase .../>`), which is why the body group is optional.
export function parseJUnit(xml) {
  const failures = [];
  const testcase = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
  for (const match of xml.matchAll(testcase)) {
    const attributes = match[1];
    const body = match[2] ?? '';
    if (!/<failure\b|<error\b/u.test(body)) continue;
    // `\s` before each attribute: a bare `name="` also matches inside
    // `classname="`, which would report the class as the test name.
    const rawName = /\sname="([^"]*)"/u.exec(attributes)?.[1] ?? 'unknown';
    const classname = decodeEntities(
      /\sclassname="([^"]*)"/u.exec(attributes)?.[1] ?? '',
    );
    const name = decodeEntities(rawName);
    const raw =
      /message="([^"]*)"/u.exec(body)?.[1] ??
      body.replaceAll(/<[^>]*>/gu, '').trim() ??
      '';
    // Decode before splitting: a JUnit message escapes its newlines (`&#10;`),
    // so splitting first would leave the entity in the reported line.
    failures.push({
      name: classname ? `${classname} > ${name}` : name,
      message: decodeEntities(raw).split('\n')[0].trim(),
    });
  }
  return failures;
}

function decodeEntities(value) {
  return value
    .replaceAll(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function cellFor(step) {
  if (!step) return '⏭';
  const seconds = Math.round(step.durationMs / 1000);
  const mark = step.exitCode === 0 ? '✅' : '❌';
  return `${mark} ${seconds}s`;
}

function formatDuration(totalMs) {
  const seconds = Math.round(totalMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
}

/// Builds the Markdown. Pure: takes the parsed inputs and returns a string, so
/// the tests need no filesystem.
export function buildReport({
  reports = [],
  meta = {},
  junitFailures = [],
  runtimeByJob = {},
}) {
  const lines = [MARKER, ''];

  const failedSteps = [];
  let stepCount = 0;
  let durationMs = 0;
  for (const report of reports) {
    for (const step of report.steps) {
      stepCount += 1;
      durationMs += step.durationMs ?? 0;
      if (step.exitCode !== 0) failedSteps.push({ job: report.job, ...step });
    }
  }
  const ok = failedSteps.length === 0;

  const sha = meta.sha ? `\`${meta.sha.slice(0, 7)}\`` : 'unknown commit';
  const runLink = meta.runUrl ? ` — [run](${meta.runUrl})` : '';
  const verdict = ok
    ? `✅ **CI passed** — ${sha}${runLink}`
    : `❌ **CI failed** — ${sha}${runLink}`;
  lines.push(verdict, '');
  if (stepCount > 0)
    lines.push(
      `${stepCount} step(s) across ${reports.length} job(s), ${formatDuration(durationMs)} total.`,
      '',
    );

  if (reports.length > 0) {
    const headers = ['job', ...STAGES.map(stage => stage.label)];
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`|${headers.map(() => '---').join('|')}|`);
    for (const report of reports) {
      const cells = STAGES.map(stage => {
        const step = report.steps.find(
          candidate => stageFor(candidate.name) === stage.key,
        );
        return cellFor(step);
      });
      lines.push(`| ${report.job} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  if (Object.keys(runtimeByJob).length > 0) {
    lines.push('**C++ runtime**', '');
    for (const [job, runtime] of Object.entries(runtimeByJob)) {
      lines.push(`- ${job}: ${describeRuntime(runtime, meta) ?? 'unknown'}`);
    }
    lines.push('');
  }

  if (meta.cppChanged) {
    lines.push(
      '> This PR changes the prebuilt C++ inputs. A new prebuilt release is ' +
        'needed after merge (dispatch prebuilt-binaries.yml).',
      '',
    );
  }

  if (meta.changedCppInputs?.length) {
    lines.push('**C++ inputs changed**', '');
    for (const file of meta.changedCppInputs.slice(0, MAX_BOUNDARY_LINES)) {
      lines.push(`- \`${file}\``);
    }
    if (meta.changedCppInputs.length > MAX_BOUNDARY_LINES) {
      lines.push(
        `- …and ${meta.changedCppInputs.length - MAX_BOUNDARY_LINES} more`,
      );
    }
    lines.push('');
  }

  if (meta.coreBoundary) {
    const {
      hitCount,
      corePrivateCount,
      corePrivate = [],
      hits = [],
    } = meta.coreBoundary;
    lines.push('**Core boundary**', '');
    lines.push(
      hitCount === 0
        ? '- core names no library'
        : `- ${hitCount} place(s) still name a library: ${hits
            .slice(0, MAX_BOUNDARY_LINES)
            .map(hit => `\`${hit.file}:${hit.line}\``)
            .join(', ')}${hitCount > MAX_BOUNDARY_LINES ? ', …' : ''}`,
    );
    lines.push(
      `- \`// core-private:\` uses: ${corePrivateCount}${
        corePrivateCount > 0
          ? ` (${corePrivate
              .slice(0, MAX_BOUNDARY_LINES)
              .map(entry => `${entry.file}:${entry.line}`)
              .join(', ')})`
          : ''
      }`,
    );
    lines.push('');
  }

  if (junitFailures.length > 0) {
    lines.push('**Failing tests**', '');
    for (const failure of junitFailures) {
      lines.push(`- \`${failure.name}\`: ${failure.message}`);
    }
    lines.push('');
  }

  const detailsBlocks = failedSteps.map(step => {
    const artifact = `logs-${step.job}`;
    const body = [
      `<details><summary>❌ ${step.job} / ${step.name}</summary>`,
      '',
      `Exit code \`${step.exitCode}\`. Log: \`${step.logPath}\`.`,
      '',
    ];
    if (step.excerpt) {
      body.push('```', step.excerpt, '```', '');
    }
    body.push(`Artifact: \`${artifact}\``, '', '</details>', '');
    return body.join('\n');
  });
  if (detailsBlocks.length > 0)
    lines.push('**Failures**', '', ...detailsBlocks);

  let body = lines.join('\n');

  // Truncate the biggest excerpts first so the body fits, and say so.
  if (body.length > MAX_BODY) {
    const order = failedSteps
      .map((step, index) => ({ index, size: step.excerpt?.length ?? 0 }))
      .sort((a, b) => b.size - a.size);
    for (const { index } of order) {
      if (body.length <= MAX_BODY) break;
      const job = failedSteps[index].job;
      const step = failedSteps[index];
      const block = detailsBlocks[index];
      const trimmed = [
        `<details><summary>❌ ${job} / ${step.name}</summary>`,
        '',
        `Exit code \`${step.exitCode}\`. Log: \`${step.logPath}\`.`,
        '',
        `_(excerpt truncated: the full log is in the \`logs-${job}\` artifact)_`,
        '',
        '</details>',
        '',
      ].join('\n');
      body = body.replace(block, trimmed);
    }
    if (body.length > MAX_BODY) {
      body = `${body.slice(0, MAX_BODY - 200)}\n\n_(report truncated; see the ci-report artifact)_\n`;
    }
    body +=
      '\n> Excerpts were truncated to keep this comment under the size limit. ' +
      'Download the `logs-<job>` artifacts for the full output.\n';
  }

  return body;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectReports(root) {
  const dir = path.join(root, 'reports');
  if (!fs.existsSync(dir)) return [];
  const reports = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith('.json')) continue;
    const parsed = readJson(path.join(dir, entry));
    if (parsed && Array.isArray(parsed.steps))
      reports.push({
        job: parsed.job ?? entry.replace(/\.json$/u, ''),
        ...parsed,
      });
  }
  return reports;
}

function collectJUnit(root) {
  const dir = path.join(root, 'junit');
  if (!fs.existsSync(dir)) return [];
  const failures = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith('.xml')) continue;
    try {
      failures.push(
        ...parseJUnit(fs.readFileSync(path.join(dir, entry), 'utf8')),
      );
    } catch {}
  }
  return failures;
}

/// The A3 runtime line per job, read from that job's build log. Only jobs that
/// produced one are listed.
///
/// `step.logPath` is relative to the output root (step.mjs writes it that way),
/// so it is resolved against `root`; a fixture or an absolute path still works.
function collectRuntimes(root, reports) {
  const found = {};
  for (const report of reports) {
    for (const step of report.steps) {
      if (!step.logPath) continue;
      const file = path.isAbsolute(step.logPath)
        ? step.logPath
        : path.join(root, path.relative('ci-out', step.logPath));
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        try {
          text = fs.readFileSync(path.join(repoRoot, step.logPath), 'utf8');
        } catch {
          continue;
        }
      }
      const runtime = readRuntimeFromLog(text);
      if (runtime) found[report.job] = runtime;
    }
  }
  return found;
}

/// Reads an output directory and renders the report for it. Exported so the
/// fixture directories are exercised by the test, not just by hand.
export function renderReportFromDir(root) {
  const resolved = path.resolve(root);
  const reports = collectReports(resolved);
  const meta = readJson(path.join(resolved, 'meta.json')) ?? {};
  const junitFailures = collectJUnit(resolved);
  const runtimeByJob = collectRuntimes(resolved, reports);
  return buildReport({ reports, meta, junitFailures, runtimeByJob });
}

function main() {
  const root = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repoRoot, 'ci-out');
  process.stdout.write(`${renderReportFromDir(root)}\n`);
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(fileURLToPath(import.meta.url)) ===
    fs.realpathSync(path.resolve(process.argv[1]))
)
  main();
