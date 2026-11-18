// Fabric vs Loom benchmark. See docs/renderer-benchmark.md.
//
//   node scripts/bench.mjs prepare fabric|loom
//   node scripts/bench.mjs run [--runs 7] [--warmup 1] [--scenarios a,b] [--renderers fabric,loom]
//   node scripts/bench.mjs report <results.json>
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(projectRoot, '../..');
const outRoot =
  process.env.RN_GPUI_BENCH_DIR ?? path.join(repoRoot, '.local/bench');
const require = createRequire(import.meta.url);

const WINDOW = { width: 1024, height: 768 };

/** id, module, initial props, whether the runner presses start. */
const SCENARIOS = [
  { id: 'cold-start', module: 'cold-start', props: { n: 3000 } },
  {
    id: 'mount-1k',
    module: 'mount',
    props: { n: 1000, iterations: 5 },
    start: true,
  },
  {
    id: 'mount-5k',
    module: 'mount',
    props: { n: 5000, iterations: 5 },
    start: true,
  },
  {
    id: 'mount-10k',
    module: 'mount',
    props: { n: 10000, iterations: 3 },
    start: true,
  },
  {
    id: 'updates-500',
    module: 'updates',
    props: { n: 500, iterations: 300 },
    start: true,
  },
  {
    id: 'updates-2000',
    module: 'updates',
    props: { n: 2000, iterations: 120 },
    start: true,
  },
  {
    id: 'list',
    module: 'list',
    props: { n: 1000, iterations: 60 },
    start: true,
  },
  {
    id: 'layout',
    module: 'layout',
    props: { n: 6, iterations: 60 },
    start: true,
  },
  { id: 'input-small', module: 'input', props: { n: 200, iterations: 40 } },
  { id: 'input-5k', module: 'input', props: { n: 5000, iterations: 40 } },
  {
    id: 'text',
    module: 'text',
    props: { n: 1500, iterations: 60 },
    start: true,
  },
];

function args(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
    else (options._ ??= []).push(argv[i]);
  }
  return options;
}

const rendererDir = renderer => path.join(outRoot, renderer);

function rendererEnv(renderer) {
  return {
    ...process.env,
    RN_GPUI_RENDERER: renderer,
    ...(renderer === 'loom' ? { RN_GPUI_JS_THREAD: 'background' } : {}),
  };
}

function prepare(renderer) {
  const env = { ...rendererEnv(renderer), RN_GPUI_BUILD_FROM_SOURCE: '1' };
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
  // The copy must not load the other renderer's libjsi from the target
  // directory, so that rpath goes and the library sits in ../Frameworks.
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

// proc_pid_rusage gives CPU time and the physical footprint (current and
// lifetime peak) of another process, which `ps` does not.
const RUSAGE_C = `
#include <libproc.h>
#include <mach/mach_time.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  struct rusage_info_v4 info;
  if (proc_pid_rusage(atoi(argv[1]), RUSAGE_INFO_V4, (rusage_info_t *)&info)) return 1;
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  double ns = (double)tb.numer / tb.denom;
  printf("{\\"userMs\\":%.3f,\\"sysMs\\":%.3f,\\"footprint\\":%llu,\\"peakFootprint\\":%llu,\\"rss\\":%llu}\\n",
    info.ri_user_time * ns / 1e6, info.ri_system_time * ns / 1e6,
    info.ri_phys_footprint, info.ri_lifetime_max_phys_footprint, info.ri_resident_size);
  return 0;
}`;

function rusageTool() {
  const tool = path.join(outRoot, 'pid-rusage');
  if (!fs.existsSync(tool)) {
    fs.mkdirSync(outRoot, { recursive: true });
    const source = `${tool}.c`;
    fs.writeFileSync(source, RUSAGE_C);
    execFileSync('cc', ['-O2', '-o', tool, source]);
  }
  return pid =>
    JSON.parse(execFileSync(tool, [String(pid)], { encoding: 'utf8' }));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** `[startup] +<ms> <stage>` lines the runtime prints with RN_GPUI_STARTUP_TRACE. */
function startupMarks(app) {
  return app
    .readLogs()
    .split('\n')
    .map(line => line.match(/\[startup\] \+(\d+) (.*)$/u))
    .filter(Boolean)
    .map(match => ({ ms: Number(match[1]), stage: match[2].trim() }));
}

function benchEvents(app) {
  return app
    .readLogs()
    .split('\n')
    .map(line => line.match(/\[bench\] (\{.*\})\s*$/u))
    .filter(Boolean)
    .map(match => JSON.parse(match[1]));
}

/** A driver click without the locator's wait for idle, which a running scenario never reaches. */
async function press(app, testID) {
  const [match] = await app.getByTestId(testID).all();
  if (!match) throw new Error(`no ${testID}`);
  await app.click(match.tag);
}

/** `[mount-trace]` lines (RN_GPUI_MOUNT_TRACE): app-surface batches applied, the frames presented after them, and input events dispatched by the driver. */
function mountTrace(app) {
  return app
    .readLogs()
    .split('\n')
    .map(line =>
      line.match(
        /\[mount-trace\] (applied|presented|input)(?: batch=(\d+))?(?: ops=(\d+))?.* epoch_ms=([\d.]+)/u,
      ),
    )
    .filter(Boolean)
    .map(match => ({
      kind: match[1],
      batch: Number(match[2] ?? 0),
      ops: Number(match[3] ?? 0),
      epoch: Number(match[4]),
    }));
}

/**
 * Native marks for the press's commit: its mount batch (the largest app-surface
 * batch after the JS press) applied on the main thread, and the frame that shows
 * it presented, both from the JS `Date.now()` of the press.
 */
function pressMarks(app, target) {
  const press = benchEvents(app)
    .filter(event => event.event === 'press' && event.target === target)
    .at(-1);
  const marks = mountTrace(app).filter(mark => mark.epoch >= press.epoch);
  const batch = marks
    .filter(mark => mark.kind === 'applied')
    .reduce((best, mark) => (best && best.ops >= mark.ops ? best : mark), null);
  const presented = marks.find(
    mark => mark.kind === 'presented' && mark.batch === batch?.batch,
  );
  return {
    appliedMs: batch ? batch.epoch - press.epoch : NaN,
    presentedMs: presented ? presented.epoch - press.epoch : NaN,
  };
}

/**
 * Input latency: a driver click on a button and a typed character, each read
 * back as the time to the JS handler, to React's commit and to the frame that
 * shows the result, from the moment the driver sends it.
 */
async function inputSteps(app, iterations) {
  const kinds = [
    ['tap', 'tapHandled', 'tapCommitted', () => press(app, 'bench-press')],
    [
      'type',
      'typeHandled',
      'typeCommitted',
      async () => {
        const [input] = await app.getByTestId('bench-input').all();
        await app.typeText(input.tag, 'a');
      },
    ],
  ];
  const [focusTarget] = await app.getByTestId('bench-input').all();
  await app.click(focusTarget.tag);
  await app.waitForIdle({ timeout: 30_000 });
  const samples = { tap: [], type: [] };
  const count = name =>
    benchEvents(app).filter(event => event.event === name).length;
  for (let i = 0; i < iterations + 2; i++) {
    for (const [kind, handled, committed, act] of kinds) {
      const seen = count(committed);
      const sent = Date.now();
      await act();
      while (count(committed) === seen) await sleep(2);
      await app.waitForIdle({ timeout: 30_000 });
      const events = benchEvents(app);
      const handledAt = events.filter(e => e.event === handled).at(-1).epoch;
      const committedAt = events
        .filter(e => e.event === committed)
        .at(-1).epoch;
      const trace = mountTrace(app).filter(mark => mark.epoch >= sent);
      const dispatchedAt = trace.find(mark => mark.kind === 'input').epoch;
      const marks = trace.filter(mark => mark.epoch >= dispatchedAt);
      const applied = marks.find(mark => mark.kind === 'applied');
      const presented = marks.find(
        mark =>
          mark.kind === 'presented' && mark.batch >= (applied?.batch ?? 0),
      );
      if (i >= 2)
        samples[kind].push({
          driverMs: dispatchedAt - sent,
          handledMs: handledAt - dispatchedAt,
          commitMs: committedAt - handledAt,
          appliedMs: applied ? applied.epoch - dispatchedAt : NaN,
          presentedMs: presented ? presented.epoch - dispatchedAt : NaN,
        });
    }
  }
  const summary = values => {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    return {
      median: sorted[Math.floor(sorted.length / 2)],
      p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
    };
  };
  const out = {};
  for (const kind of ['tap', 'type'])
    out[kind] = Object.fromEntries(
      ['driverMs', 'handledMs', 'commitMs', 'appliedMs', 'presentedMs'].map(
        key => [key, summary(samples[kind].map(sample => sample[key]))],
      ),
    );
  return out;
}

/** Each step: press, then time to React's commit (JS), to the native marks, and to the driver reporting the window idle. */
async function mountSteps(app, iterations) {
  const steps = {
    mount: {
      commitMs: [],
      idleMs: [],
      appliedMs: [],
      presentedMs: [],
      layoutNodes: [],
    },
    unmount: { commitMs: [], idleMs: [], appliedMs: [], presentedMs: [] },
  };
  const count = name =>
    benchEvents(app).filter(event => event.event === name).length;
  for (let i = 0; i < iterations; i++) {
    for (const [kind, testID, event] of [
      ['mount', 'bench-mount', 'mounted'],
      ['unmount', 'bench-unmount', 'unmounted'],
    ]) {
      const seen = count(event);
      const started = performance.now();
      await press(app, testID);
      await app.waitForIdle({ timeout: 60_000 });
      steps[kind].idleMs.push(performance.now() - started);
      while (count(event) === seen) await sleep(5);
      steps[kind].commitMs.push(
        benchEvents(app)
          .filter(e => e.event === event)
          .at(-1).commitMs,
      );
      const marks = pressMarks(app, kind);
      steps[kind].appliedMs.push(marks.appliedMs);
      steps[kind].presentedMs.push(marks.presentedMs);
      if (kind === 'mount')
        steps[kind].layoutNodes.push((await app.layoutStats()).layoutNodes);
    }
  }
  const median = values =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const p90 = values =>
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.floor(values.length * 0.9))
    ];
  const summary = values => ({ median: median(values), p90: p90(values) });
  return {
    mount: {
      commitMs: summary(steps.mount.commitMs),
      appliedMs: summary(steps.mount.appliedMs),
      presentedMs: summary(steps.mount.presentedMs),
      idleMs: summary(steps.mount.idleMs),
    },
    unmount: {
      commitMs: summary(steps.unmount.commitMs),
      appliedMs: summary(steps.unmount.appliedMs),
      presentedMs: summary(steps.unmount.presentedMs),
      idleMs: summary(steps.unmount.idleMs),
    },
    layoutNodesMounted: median(steps.mount.layoutNodes),
  };
}

async function waitForEvent(app, name, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = benchEvents(app).find(
      event => event.event === name || event.event === 'error',
    );
    if (found) {
      if (found.event === 'error')
        throw new Error(`scenario failed: ${found.message}`);
      return found;
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${name}`);
    await sleep(20);
  }
}

async function runOnce({ launchApp }, renderer, scenario, rusage) {
  const dir = rendererDir(renderer);
  const launchEpoch = Date.now();
  const launched = performance.now();
  const app = await launchApp({
    executable: path.join(dir, 'bin', 'rn-gpui-tester'),
    bundle: path.join(dir, 'bench.bundle'),
    env: {
      ...rendererEnv(renderer),
      RN_GPUI_MODULE: `Bench--${scenario.module}`,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_STARTUP_TRACE: '1',
      ...(scenario.module === 'mount' || scenario.module === 'input'
        ? { RN_GPUI_MOUNT_TRACE: '1' }
        : {}),
    },
    initialProps: scenario.props,
    disableAnimations: true,
    offscreen: process.env.RN_GPUI_BENCH_OFFSCREEN === '1',
    timeout: 60_000,
    logFile: path.join(os.tmpdir(), `rn-gpui-bench-${process.pid}.log`),
  });
  const metrics = {};
  try {
    metrics.launchToIdleMs = performance.now() - launched;
    const atIdle = rusage(app.pid);
    metrics.startupCpuMs = atIdle.userMs + atIdle.sysMs;
    metrics.startupFootprintMB = atIdle.footprint / 2 ** 20;
    if (scenario.id === 'cold-start') {
      const events = benchEvents(app);
      const at = name => events.find(event => event.event === name)?.epoch;
      // Native marks, in ms from process creation (RN_GPUI_STARTUP_TRACE).
      // "mounted" is the last startup mount applied on the main thread and
      // "displayed" the frame after it; the JS `useEffect` mark is taken when
      // React commits, before Loom's worker lays out, so it flatters Loom.
      const marks = startupMarks(app);
      const mounts = marks.filter(mark =>
        mark.stage.startsWith('mount applied'),
      );
      const frames = marks.filter(
        mark => mark.stage === 'content frame presented',
      );
      metrics.bundleLoadedMs = marks.find(
        mark => mark.stage === 'bundle load end',
      )?.ms;
      metrics.mountedMs = mounts.at(-1)?.ms;
      metrics.displayedMs = frames
        .filter(f => f.ms >= metrics.mountedMs)
        .at(0)?.ms;
      metrics.jsUseEffectMs = at('committed') - launchEpoch;
      const pressEpoch = Date.now();
      await press(app, 'bench-press');
      const pressed = await waitForEvent(app, 'pressed', 10_000);
      metrics.pressHandledMs = pressed.epoch - pressEpoch;
      metrics.ttiInteractiveMs = pressed.epoch - launchEpoch;
      const stats = await app.layoutStats({ reset: true });
      metrics.layoutNodes = stats.layoutNodes;
    } else {
      await app.setWindowSize(WINDOW.width, WINDOW.height);
      await app.waitForIdle({ timeout: 20_000 });
      await app.layoutStats({ reset: true });
      const before = rusage(app.pid);
      const started = performance.now();
      let done;
      if (scenario.module === 'mount')
        done = { result: await mountSteps(app, scenario.props.iterations) };
      else if (scenario.module === 'input')
        done = { result: await inputSteps(app, scenario.props.iterations) };
      else {
        await press(app, 'bench-start');
        done = await waitForEvent(app, 'done', 300_000);
      }
      await app.waitForIdle({ timeout: 30_000 });
      metrics.scenarioWallMs = performance.now() - started;
      const after = rusage(app.pid);
      const stats = await app.layoutStats({ reset: true });
      metrics.scenarioCpuMs =
        after.userMs + after.sysMs - before.userMs - before.sysMs;
      metrics.frames = stats.frames;
      metrics.nativeLayoutMs = stats.computeLayoutMs;
      metrics.nativePrepaintMs = stats.prepaintMs;
      metrics.nativePaintMs = stats.paintMs;
      metrics.nativeMeasureMs = stats.measureMs;
      metrics.js = done.result;
    }
    await sleep(500);
    const end = rusage(app.pid);
    metrics.totalCpuMs = end.userMs + end.sysMs;
    metrics.steadyFootprintMB = end.footprint / 2 ** 20;
    metrics.peakFootprintMB = end.peakFootprint / 2 ** 20;
    metrics.rssMB = end.rss / 2 ** 20;
  } finally {
    await app.close();
  }
  return metrics;
}

/** Flattens the scenario's JS summary into `js.<path>.median` style metrics. */
function flatten(metrics) {
  const out = {};
  const walk = (value, prefix) => {
    if (value && typeof value === 'object') {
      if ('median' in value && 'p90' in value) {
        out[`${prefix}.median`] = value.median;
        out[`${prefix}.p90`] = value.p90;
        return;
      }
      for (const [key, inner] of Object.entries(value))
        walk(inner, prefix ? `${prefix}.${key}` : key);
    } else if (
      typeof value === 'number' &&
      !/^js\.(n|iterations|depth)$/u.test(prefix)
    )
      out[prefix] = value;
  };
  walk(metrics, '');
  return out;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = p =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    median: q(0.5),
    p90: q(0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
}

const fmt = value =>
  Math.abs(value) >= 100
    ? value.toFixed(0)
    : Math.abs(value) >= 10
      ? value.toFixed(1)
      : value.toFixed(2);

function report(results) {
  const lines = [];
  lines.push(
    `Runs per renderer: ${results.runs} (after ${results.warmup} warm-up), interleaved. ${results.machine}`,
  );
  lines.push('');
  lines.push(
    'Significant: the medians differ by more than the larger min–max spread of the two renderers; `~` otherwise.',
  );
  for (const scenario of Object.keys(results.scenarios)) {
    const byRenderer = results.scenarios[scenario];
    const fabric = (byRenderer.fabric ?? []).map(flatten);
    const loom = (byRenderer.loom ?? []).map(flatten);
    if (!fabric.length || !loom.length) continue;
    lines.push(
      '',
      `### ${scenario}`,
      '',
      '| metric | Fabric median (p90, min–max) | Loom bg median (p90, min–max) | Δ median | sig |',
      '|---|---|---|---|---|',
    );
    for (const key of Object.keys(fabric[0] ?? {})) {
      const f = stats(fabric.map(run => run[key]).filter(Number.isFinite));
      const l = stats(loom.map(run => run[key]).filter(Number.isFinite));
      if (!f.n || !l.n) continue;
      const delta = f.median ? ((l.median - f.median) / f.median) * 100 : 0;
      const spread = Math.max(f.max - f.min, l.max - l.min);
      const significant = Math.abs(l.median - f.median) > spread;
      const cell = s =>
        `${fmt(s.median)} (${fmt(s.p90)}, ${fmt(s.min)}–${fmt(s.max)})`;
      lines.push(
        `| ${key} | ${cell(f)} | ${cell(l)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% | ${significant ? '**yes**' : '~'} |`,
      );
    }
  }
  return lines.join('\n');
}

async function run(options) {
  const testing = await import(
    require.resolve('@react-native-gpui/testing', { paths: [projectRoot] })
  );
  const launchApp =
    testing.launchApp ?? testing.DesktopApp.launch.bind(testing.DesktopApp);
  const runs = Number(options.runs ?? 7);
  const warmup = Number(options.warmup ?? 1);
  const renderers = (options.renderers ?? 'fabric,loom').split(',');
  const wanted = options.scenarios?.split(',');
  const scenarios = SCENARIOS.filter(
    scenario => !wanted || wanted.includes(scenario.id),
  );
  const rusage = rusageTool();
  const caffeinate =
    spawnSync('which', ['caffeinate']).status === 0
      ? (await import('node:child_process')).spawn(
          'caffeinate',
          ['-d', '-i', '-w', String(process.pid)],
          { stdio: 'ignore' },
        )
      : undefined;
  caffeinate?.unref();
  const results = {
    date: new Date().toISOString(),
    machine: `${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, load ${os
      .loadavg()
      .map(v => v.toFixed(2))
      .join(' ')} at start.`,
    runs,
    warmup,
    window: WINDOW,
    scenarios: {},
  };
  for (const scenario of scenarios) {
    results.scenarios[scenario.id] = Object.fromEntries(
      renderers.map(r => [r, []]),
    );
    for (let i = 0; i < warmup + runs; i++) {
      const order = i % 2 ? [...renderers].reverse() : renderers;
      for (const renderer of order) {
        const metrics = await runOnce(
          { launchApp },
          renderer,
          scenario,
          rusage,
        );
        const label = i < warmup ? 'warm-up' : `run ${i - warmup + 1}`;
        console.log(
          `[bench] ${scenario.id} ${renderer} ${label}: cpu ${fmt(metrics.scenarioCpuMs ?? metrics.totalCpuMs)} ms, peak ${fmt(metrics.peakFootprintMB)} MB`,
        );
        if (i >= warmup) results.scenarios[scenario.id][renderer].push(metrics);
      }
    }
  }
  const stamp = results.date.replaceAll(/[:.]/gu, '-');
  const jsonPath = path.join(outRoot, `results-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  const markdown = report(results);
  fs.writeFileSync(jsonPath.replace(/\.json$/u, '.md'), markdown);
  console.log(markdown);
  console.log(`\n[bench] wrote ${jsonPath}`);
}

const options = args(process.argv.slice(2));
const [command, target] = options._ ?? [];
if (command === 'prepare') prepare(target);
else if (command === 'run') await run(options);
else if (command === 'report')
  console.log(report(JSON.parse(fs.readFileSync(target, 'utf8'))));
else {
  console.error(
    'usage: bench.mjs prepare <fabric|loom> | run [--runs N] [--warmup N] [--scenarios ids] [--renderers fabric,loom] | report <file>',
  );
  process.exit(1);
}
