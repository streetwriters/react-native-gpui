// Memory benchmark: what a mounted React Native view costs. See docs/memory.md.
//
//   node scripts/bench.mjs prepare fabric
//   node scripts/bench-memory.mjs run [--sizes 1000,5000,10000] [--cycles 2] [--depth 0] [--renderer fabric] [--build <dir in .local/bench>]
//   node scripts/bench-memory.mjs budget [--sizes 1000,10000] [--top 40] [--files <1k stacks>,<10k stacks>]
//   node scripts/bench-memory.mjs inspect [--size 5000] [--mounted]
//   node scripts/bench-memory.mjs owners [--size 5000] [--top 40] [--unmounted]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
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
const MB = 2 ** 20;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function args(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const next = argv[i + 1];
      options[argv[i].slice(2)] =
        next === undefined || next.startsWith('--') ? true : argv[++i];
    } else (options._ ??= []).push(argv[i]);
  }
  return options;
}

const RUSAGE_C = `
#include <libproc.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  struct rusage_info_v4 info;
  if (proc_pid_rusage(atoi(argv[1]), RUSAGE_INFO_V4, (rusage_info_t *)&info)) return 1;
  printf("{\\"footprint\\":%llu,\\"peakFootprint\\":%llu,\\"rss\\":%llu}\\n",
    info.ri_phys_footprint, info.ri_lifetime_max_phys_footprint, info.ri_resident_size);
  return 0;
}`;

function rusageTool() {
  const tool = path.join(outRoot, 'pid-footprint');
  if (!fs.existsSync(tool)) {
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(`${tool}.c`, RUSAGE_C);
    execFileSync('cc', ['-O2', '-o', tool, `${tool}.c`]);
  }
  return pid =>
    JSON.parse(execFileSync(tool, [String(pid)], { encoding: 'utf8' }));
}

/** Live malloc nodes and bytes across every zone, from `heap`. */
function heapTotals(pid) {
  const out = execFileSync('heap', ['-q', '-s', String(pid)], {
    encoding: 'utf8',
    maxBuffer: 256 * MB,
  });
  const match = out.match(/All zones?:\s+(\d+) nodes \(\s*(\d+) bytes\)/u);
  return match ? { nodes: Number(match[1]), bytes: Number(match[2]) } : {};
}

/** Dirty, swapped and clean memory by region type, from `vmmap --summary`. */
function vmmapSummary(pid) {
  const out = execFileSync('vmmap', ['--summary', String(pid)], {
    encoding: 'utf8',
    maxBuffer: 64 * MB,
  });
  const size = text => {
    const match = /^([\d.]+)([KMG]?)$/u.exec(text);
    if (!match) return 0;
    return Number(match[1]) * { '': 1, K: 1024, M: MB, G: 2 ** 30 }[match[2]];
  };
  const regions = [];
  let inTable = false;
  for (const line of out.split('\n')) {
    if (/^REGION TYPE\s+SIZE/u.test(line)) inTable = true;
    else if (inTable && /^={5,}/u.test(line)) continue;
    else if (inTable && /^TOTAL/u.test(line)) inTable = false;
    else if (inTable) {
      const match =
        /^(.+?)\s{2,}([\d.]+[KMG]?)\s+([\d.]+[KMG]?)\s+([\d.]+[KMG]?)\s+([\d.]+[KMG]?)\s+([\d.]+[KMG]?)/u.exec(
          line,
        );
      if (match)
        regions.push({
          region: match[1].trim(),
          virtual: size(match[2]),
          resident: size(match[3]),
          dirty: size(match[4]),
          swapped: size(match[5]),
        });
    }
  }
  return regions.sort((a, b) => b.dirty + b.swapped - (a.dirty + a.swapped));
}

function benchEvents(app) {
  return app
    .readLogs()
    .split('\n')
    .map(line => line.match(/\[bench\] (\{.*\})\s*$/u))
    .filter(Boolean)
    .map(match => JSON.parse(match[1]));
}

async function press(app, testID) {
  const [match] = await app.getByTestId(testID).all();
  if (!match) throw new Error(`no ${testID}`);
  await app.click(match.tag);
}

async function launch(renderer, n, env = {}, build = renderer, depth = 0) {
  const testing = await import(
    require.resolve('@react-native-gpui/testing', { paths: [projectRoot] })
  );
  const dir = path.join(outRoot, build);
  if (!fs.existsSync(path.join(dir, 'bin', 'rn-gpui-tester')))
    throw new Error(
      `no build in ${dir}; run \`node scripts/bench.mjs prepare ${renderer}\``,
    );
  const app = await testing.launchApp({
    executable: path.join(dir, 'bin', 'rn-gpui-tester'),
    bundle: path.join(dir, 'bench.bundle'),
    env: {
      RN_GPUI_RENDERER: renderer,
      RN_GPUI_MODULE: 'Bench--mount',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      ...env,
    },
    initialProps: { n, depth },
    disableAnimations: true,
    offscreen: process.env.RN_GPUI_BENCH_OFFSCREEN === '1',
    timeout: 60_000,
    logFile: path.join(os.tmpdir(), `rn-gpui-bench-memory-${process.pid}.log`),
  });
  app.n = n;
  app.depth = depth;
  await app.setWindowSize(1024, 768);
  await app.waitForIdle({ timeout: 30_000 });
  return app;
}

/** Presses mount or unmount and waits until React committed and the window is idle. */
async function toggle(app, mount) {
  const event = mount ? 'mounted' : 'unmounted';
  const seen = benchEvents(app).filter(e => e.event === event).length;
  await press(app, mount ? 'bench-mount' : 'bench-unmount');
  while (benchEvents(app).filter(e => e.event === event).length === seen)
    await sleep(10);
  await app.waitForIdle({ timeout: 120_000 });
  // The window gives back what only its next frame would use after a second
  // without frames; a sample is of the settled, idle app.
  await sleep(2500);
}

function sample(app, rusage) {
  return app.layoutStats().then(stats => ({
    ...rusage(app.pid),
    heap: heapTotals(app.pid),
    views: stats.views ?? gridViews(app.n, app.depth),
    layoutNodes: stats.layoutNodes,
  }));
}

/** The React Native views the mount scenario's grid holds: cells, their texts, the views around them, rows and the grid. */
const gridViews = (n, depth = 0) => (2 + depth) * n + Math.ceil(n / 10) + 1;

/** Least-squares slope of y over x. */
function slope(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den ? num / den : NaN;
}

const fmtMB = bytes => (bytes / MB).toFixed(1);

async function run(options) {
  const renderer = options.renderer ?? 'fabric';
  const sizes = (options.sizes ?? '1000,5000,10000').split(',').map(Number);
  const cycles = Number(options.cycles ?? 2);
  const rusage = rusageTool();
  const rows = [];
  for (const n of sizes) {
    const app = await launch(
      renderer,
      n,
      {},
      options.build,
      Number(options.depth ?? 0),
    );
    try {
      // The GPU driver holds about 100 MB of working memory until a second
      // after the last frame; wait for it so the baseline is the settled one.
      await sleep(2500);
      const idle = await sample(app, rusage);
      const cyclesOut = [];
      for (let i = 0; i < cycles; i++) {
        await toggle(app, true);
        const mounted = await sample(app, rusage);
        await toggle(app, false);
        const unmounted = await sample(app, rusage);
        cyclesOut.push({ mounted, unmounted });
      }
      const row = { n, idle, cycles: cyclesOut };
      if (options.vmmap && n === Math.max(...sizes)) {
        await toggle(app, true);
        row.vmmap = vmmapSummary(app.pid).slice(0, 25);
        await toggle(app, false);
      }
      rows.push(row);
      const m = cyclesOut[0].mounted;
      const last = cyclesOut.at(-1);
      console.log(
        `[memory] n=${n} views=${m.views} layoutNodes=${m.layoutNodes} footprint idle ${fmtMB(idle.footprint)} MB, mounted ${fmtMB(m.footprint)} MB, unmounted ${fmtMB(last.unmounted.footprint)} MB; heap mounted ${fmtMB(m.heap.bytes)} MB in ${m.heap.nodes} nodes, unmounted ${fmtMB(last.unmounted.heap.bytes)} MB`,
      );
    } finally {
      await app.close();
    }
  }
  const per = (pick, cycle = 0) =>
    slope(
      rows.map(row => ({
        x: row.cycles[cycle].mounted.views,
        y: pick(row.cycles[cycle].mounted, row),
      })),
    );
  const summary = {
    footprintPerView: per(m => m.footprint),
    heapPerView: per(m => m.heap.bytes),
    heapNodesPerView: per(m => m.heap.nodes),
    layoutNodesPerView: per(m => m.layoutNodes),
    remountFootprintPerView: per(m => m.footprint, cycles - 1),
    retainedAfterUnmountPerView: slope(
      rows.map(row => ({
        x: row.cycles[0].mounted.views,
        y: row.cycles.at(-1).unmounted.heap.bytes - row.idle.heap.bytes,
      })),
    ),
  };
  const lines = [
    `| n | views | layout nodes | footprint idle | mounted | unmounted | heap mounted | heap unmounted |`,
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(row => {
      const m = row.cycles[0].mounted;
      const u = row.cycles.at(-1).unmounted;
      return `| ${row.n} | ${m.views} | ${m.layoutNodes} | ${fmtMB(row.idle.footprint)} MB | ${fmtMB(m.footprint)} MB | ${fmtMB(u.footprint)} MB | ${fmtMB(m.heap.bytes)} MB | ${fmtMB(u.heap.bytes)} MB |`;
    }),
    '',
    `Per view (slope across n): footprint ${summary.footprintPerView.toFixed(0)} B, heap ${summary.heapPerView.toFixed(0)} B in ${summary.heapNodesPerView.toFixed(1)} allocations, ${summary.layoutNodesPerView.toFixed(2)} layout nodes; footprint on the last remount ${summary.remountFootprintPerView.toFixed(0)} B; heap still held after unmount ${summary.retainedAfterUnmountPerView.toFixed(0)} B.`,
  ];
  for (const row of rows.filter(entry => entry.vmmap)) {
    lines.push(
      '',
      `vmmap at n=${row.n}, mounted (MB):`,
      '',
      '| region | dirty | swapped | resident | virtual |',
      '|---|---|---|---|---|',
      ...row.vmmap.map(
        r =>
          `| ${r.region} | ${fmtMB(r.dirty)} | ${fmtMB(r.swapped)} | ${fmtMB(r.resident)} | ${fmtMB(r.virtual)} |`,
      ),
    );
  }
  const markdown = lines.join('\n');
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
  const jsonPath = path.join(outRoot, `memory-${renderer}-${stamp}.json`);
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify({ rows, summary }, null, 2));
  console.log(`\n${markdown}\n\n[memory] wrote ${jsonPath}`);
}

/** Who owns a stack: the innermost frame that is not the allocator or a std collection. */
const SKIP =
  /^(<?alloc::|<?core::|<?std::|<?hashbrown::|<?smallvec::|<?indexmap::|<?arrayvec::|<?serde_json::|<?serde::|__rust_|__rdl_|__rg_|operator new|_Znwm|_Znam|void std::__1::|std::__1::|_CF|CF|__CF|objc_|_objc|class_createInstance|<?collections::)/u;
const OWNERS = [
  ['taffy', /^<?(taffy|slotmap)::/u],
  ['gpui', /^<?(gpui|gpui_[a-z_]+|sum_tree|scheduler|refineable)::/u],
  ['store', /^<?(react_native_gpui|rn_gpui[a-z_]*)::/u],
  ['fabric', /facebook::react|folly::|yoga::|facebook::yoga/u],
  ['host', /rngpui::|Gpui[A-Z]\w*|MountBatchBuilder/u],
];

function owners(stacksText, top) {
  const { byFrame, byOwner, total } = classify(stacksText);
  return formatOwners(byFrame, byOwner, total, top);
}

function classify(stacksText) {
  const byFrame = new Map();
  const byOwner = new Map();
  let total = 0;
  for (const line of stacksText.split('\n')) {
    const header = /^(\d+) calls? for ([\d,]+) bytes: (.*)$/u.exec(line);
    if (!header) continue;
    const bytes = Number(header[2].replaceAll(',', ''));
    const calls = Number(header[1]);
    total += bytes;
    const frames = header[3].split(' | ').map(frame => {
      const match = /^0x[0-9a-f]+ \(([^)]*)\) (.*)$/u.exec(frame.trim());
      return match
        ? {
            module: match[1],
            symbol: match[2].replace(/::h[0-9a-f]{16}$/u, ''),
          }
        : { module: '?', symbol: frame.trim() };
    });
    const innermost = frames.at(-1);
    const kind = /libsystem_malloc|MallocStackLogging/u.test(innermost.module)
      ? 'malloc'
      : 'vm';
    let picked;
    for (let i = frames.length - 1; i >= 0; i--) {
      const { module, symbol } = frames[i];
      if (
        /^(libsystem_|libc\+\+|libdyld|dyld|MallocStackLogging)/u.test(module)
      )
        continue;
      if (module === 'rn-gpui-tester' && SKIP.test(symbol)) continue;
      picked = frames[i];
      break;
    }
    picked ??= innermost;
    let owner;
    if (/hermes/iu.test(picked.module)) owner = 'hermes';
    else if (picked.module !== 'rn-gpui-tester')
      owner = `system:${picked.module.replace(/^com\.apple\./u, '')}`;
    else
      owner = OWNERS.find(([, re]) => re.test(picked.symbol))?.[0] ?? 'other';
    const key = `${kind.padEnd(6)} ${owner.padEnd(10)} ${picked.symbol.slice(0, 150)}`;
    const entry = byFrame.get(key) ?? { bytes: 0, calls: 0 };
    entry.bytes += bytes;
    entry.calls += calls;
    byFrame.set(key, entry);
    const ownerKey = `${kind} ${owner}`;
    byOwner.set(ownerKey, (byOwner.get(ownerKey) ?? 0) + bytes);
  }
  return { byFrame, byOwner, total };
}

function formatOwners(byFrame, byOwner, total, top) {
  const lines = [
    `Live allocations by owner (${fmtMB(total)} MB; malloc = heap, vm = mapped regions):`,
    ...[...byOwner]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([owner, bytes]) => `  ${fmtMB(bytes).padStart(8)} MB  ${owner}`),
    '',
    `Top ${top} allocating frames:`,
    ...[...byFrame]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, top)
      .map(
        ([key, { bytes, calls }]) =>
          `  ${fmtMB(bytes).padStart(8)} MB ${String(calls).padStart(9)}x  ${key}`,
      ),
  ];
  return lines.join('\n');
}

async function ownersCommand(options) {
  const renderer = options.renderer ?? 'fabric';
  const n = Number(options.size ?? 5000);
  const top = Number(options.top ?? 40);
  const app = await launch(
    renderer,
    n,
    { MallocStackLogging: '1' },
    options.build,
  );
  try {
    await toggle(app, true);
    if (options.unmounted) await toggle(app, false);
    const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
    const raw = path.join(
      outRoot,
      `malloc-history-${options.build ?? renderer}-${n}${options.unmounted ? '-unmounted' : ''}-${stamp}.txt`,
    );
    execFileSync(
      'sh',
      [
        '-c',
        `malloc_history ${app.pid} -allBySize 2>/dev/null | c++filt > "${raw}"`,
      ],
      { maxBuffer: 16 * MB },
    );
    const report = owners(fs.readFileSync(raw, 'utf8'), top);
    fs.writeFileSync(raw.replace(/\.txt$/u, '.owners.txt'), report);
    if (!options['keep-stacks']) fs.rmSync(raw, { force: true });
    console.log(
      `${report}${options['keep-stacks'] ? `\n\n[memory] raw stacks in ${raw}` : ''}`,
    );
  } finally {
    await app.close();
  }
}

/** Live allocations of the app with the grid of `n` cells mounted, by stack. */
async function captureStacks(options, n) {
  const renderer = options.renderer ?? 'fabric';
  const app = await launch(
    renderer,
    n,
    { MallocStackLogging: '1' },
    options.build,
    Number(options.depth ?? 0),
  );
  try {
    await toggle(app, true);
    if (options.unmounted) await toggle(app, false);
    const views = (await app.layoutStats()).views ?? gridViews(n);
    const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
    const raw = path.join(
      outRoot,
      `malloc-history-${options.build ?? renderer}-${n}${options.unmounted ? '-unmounted' : ''}-${stamp}.txt`,
    );
    execFileSync(
      'sh',
      [
        '-c',
        `malloc_history ${app.pid} -allBySize 2>/dev/null | c++filt > "${raw}"`,
      ],
      { maxBuffer: 16 * MB },
    );
    return { raw, views };
  } finally {
    await app.close();
  }
}

/**
 * The heap each view costs, by owner and allocating frame: the difference
 * between two grid sizes over the difference in views, so what does not grow
 * with the tree drops out.
 */
async function budgetCommand(options) {
  const [small, large] = (options.sizes ?? '1000,10000').split(',').map(Number);
  const top = Number(options.top ?? 40);
  // `--files a,b` classifies two earlier captures of `small` and `large` cells.
  const [a, b] = options.files
    ? options.files.split(',').map((raw, i) => ({
        raw,
        views: gridViews([small, large][i], Number(options.depth ?? 0)),
      }))
    : [
        await captureStacks(options, small),
        await captureStacks(options, large),
      ];
  const ca = classify(fs.readFileSync(a.raw, 'utf8'));
  const cb = classify(fs.readFileSync(b.raw, 'utf8'));
  // A capture is about 100 MB; `--keep-stacks` keeps them for a closer look.
  if (!options.files && !options['keep-stacks'])
    for (const { raw } of [a, b]) fs.rmSync(raw, { force: true });
  const views = b.views - a.views;
  const perView = (mapA, mapB, pick) => {
    const keys = new Set([...mapA.keys(), ...mapB.keys()]);
    return [...keys]
      .map(key => ({
        key,
        bytes: (pick(mapB.get(key)) - pick(mapA.get(key))) / views,
        calls:
          ((mapB.get(key)?.calls ?? 0) - (mapA.get(key)?.calls ?? 0)) / views,
      }))
      .sort((x, y) => y.bytes - x.bytes);
  };
  const byOwner = perView(ca.byOwner, cb.byOwner, v => v ?? 0).filter(row =>
    row.key.startsWith('malloc'),
  );
  const frames = perView(ca.byFrame, cb.byFrame, v => v?.bytes ?? 0).filter(
    row => row.key.startsWith('malloc'),
  );
  const heap = byOwner.reduce((sum, row) => sum + row.bytes, 0);
  const lines = [
    `Heap per view between ${small} and ${large} cells (${views} views): ${heap.toFixed(0)} B`,
    '',
    '| owner | bytes per view |',
    '|---|---|',
    ...byOwner
      .filter(row => Math.abs(row.bytes) >= 16)
      .map(
        row =>
          `| ${row.key.replace(/^malloc /u, '')} | ${row.bytes.toFixed(0)} |`,
      ),
    '',
    '| bytes per view | allocations per view | owner and frame |',
    '|---|---|---|',
    ...frames
      .slice(0, top)
      .map(
        row =>
          `| ${row.bytes.toFixed(0)} | ${row.calls.toFixed(2)} | ${row.key.replace(/^malloc\s+/u, '').replaceAll('|', '\\|')} |`,
      ),
  ];
  const report = lines.join('\n');
  fs.writeFileSync(b.raw.replace(/\.txt$/u, '.budget.md'), report);
  console.log(report);
}

/** `footprint` and `vmmap --summary` of the app, idle or with the grid mounted. */
async function inspectCommand(options) {
  const renderer = options.renderer ?? 'fabric';
  const n = Number(options.size ?? 5000);
  const app = await launch(renderer, n, {}, options.build);
  try {
    if (options.mounted) await toggle(app, true);
    for (const [tool, toolArgs] of [
      ['footprint', ['-p', String(app.pid)]],
      ['vmmap', ['--summary', String(app.pid)]],
    ]) {
      console.log(
        execFileSync(tool, toolArgs, { encoding: 'utf8', maxBuffer: 64 * MB }),
      );
    }
  } finally {
    await app.close();
  }
}

const options = args(process.argv.slice(2));
const [command] = options._ ?? [];
if (command === 'run') await run(options);
else if (command === 'owners') await ownersCommand(options);
else if (command === 'inspect') await inspectCommand(options);
else if (command === 'budget') await budgetCommand(options);
else if (command === 'classify')
  console.log(
    owners(fs.readFileSync(options._[1], 'utf8'), Number(options.top ?? 40)),
  );
else {
  console.error(
    'usage: bench-memory.mjs run [--sizes 1000,5000,10000] [--cycles N] [--vmmap] | owners [--size N] [--top N] [--unmounted] | budget [--sizes A,B] [--top N] | inspect [--size N] [--mounted] | classify <malloc_history file>',
  );
  process.exit(1);
}
