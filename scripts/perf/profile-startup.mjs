#!/usr/bin/env node
// Measures time-to-first-frame for a packaged desktop app, and optionally
// profiles it.
//
// Usage:
//   node scripts/perf/profile-startup.mjs <app> [--runs N] [--trace]
//
// `<app>` is the executable inside a packaged `.app`, or a plain binary. The
// timeline comes from the app's own `[startup] +<ms> <stage>` lines, which
// `RN_GPUI_STARTUP_TRACE=1` turns on, so it costs one env check when off and
// nothing at all in a normal launch.
//
// `--trace` additionally records an Instruments Time Profiler trace, exports the
// main-thread samples, symbolicates them through the app's dSYM, and groups them
// by the phases in PHASES below.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/// The stage names the app emits, in order, with how to group them for the
/// profile. Keep this the single place a phase is named.
const STAGES = [
  'main entered',
  'platform created',
  'active display detected',
  'application run',
  'window state loaded',
  'opening GPUI window',
  'window open',
  'host created',
  'bundle load start',
  'bundle load end',
  'surface started',
  'first mount applied',
  'first frame presented',
];

/// Symbols in a Time Profiler sample belonging to each phase.
///
/// Ordered: the first pattern that matches wins, so the more specific ones come
/// first. The baseline table in the task was built from these.
const PHASES = [
  [
    /SecTrustSettings|SecTrust|ClientBuilder|reqwest|rustls|native.?tls/i,
    'http client build',
  ],
  [/finishLaunching|NSApplicationMain|AppleEvent/i, 'AppKit launch'],
  [/open_window|Window::new|NSWindow/i, 'window creation'],
  [/sec_font|shape_line|shape_text|CTLine|TextSystem|fontdue/i, 'text shaping'],
  [/keyboard|TISCopyCurrentKeyboard|MacKeyboardLayout/i, 'keyboard layout'],
  [/power|IOPSNotificationCreateRunLoopSource|IOKit/i, 'power observers'],
  [/tab_bar_visible|allowsAutomaticWindowTabbing/i, 'window tabbing'],
  [/set_menus|app_menu|NSMenu/i, 'menus'],
  [/GpuiHost::|ReactHost::/i, 'React host creation'],
  [/dyld|objc.*init|_objc_init/i, 'dyld / objc init'],
];

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    'usage: profile-startup.mjs <app> [--runs N] [--trace] [--keep <dir>]\n',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = { runs: 5, trace: false, keep: undefined, app: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs') {
      options.runs = Number(argv[(i += 1)]);
    } else if (arg === '--trace') {
      options.trace = true;
    } else if (arg === '--keep') {
      options.keep = argv[(i += 1)];
    } else if (arg.startsWith('-')) {
      usage(`unknown option: ${arg}`);
    } else {
      options.app = arg;
    }
  }
  if (options.app === undefined) usage('an app executable is required');
  if (!Number.isInteger(options.runs) || options.runs < 1) {
    usage('--runs needs a positive integer');
  }
  return options;
}

/// The `[startup] +<ms> <stage>` lines from one launch.
function parseTimeline(output) {
  const timeline = new Map();
  for (const line of output.split('\n')) {
    const match = line.match(/\[startup\] \+(\d+) (.+)$/u);
    if (match === null) continue;
    // The first occurrence wins: a stage emitted twice is not a later phase.
    if (!timeline.has(match[2].trim())) {
      timeline.set(match[2].trim(), Number(match[1]));
    }
  }
  return timeline;
}

/// The bundle and assets a build-tree binary needs.
///
/// A packaged app finds them beside itself; a binary run from the build tree does
/// not, by design, so they are passed when they exist.
function buildTreeEnv(app) {
  // <crate>/build/target/release/<exe> -> <crate>/build
  const buildDir = path.resolve(path.dirname(app), '..', '..', '..', 'build');
  const bundle = path.join(buildDir, 'index.bundle');
  if (!fs.existsSync(bundle)) return {};
  const assets = path.join(buildDir, 'assets', 'assets');
  return {
    RN_GPUI_BUNDLE: bundle,
    ...(fs.existsSync(assets) ? { RN_GPUI_ASSETS_DIR: assets } : {}),
  };
}

function launch(app, extraEnv = {}) {
  const result = spawnSync(app, [], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RN_GPUI_SMOKE: '1',
      RN_GPUI_STARTUP_TRACE: '1',
      RN_GPUI_ALLOW_LOCKED_SCREEN: '1',
      ...buildTreeEnv(app),
      ...extraEnv,
    },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    throw new Error(`${app} exited with ${result.status}`);
  }
  return output;
}

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/// Run the app N times and report the median of every stage.
function measure(app, runs) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    samples.push(parseTimeline(launch(app)));
  }
  const rows = [];
  for (const stage of STAGES) {
    const values = samples
      .map(sample => sample.get(stage))
      .filter(value => value !== undefined);
    if (values.length > 0)
      rows.push({ stage, ms: median(values), runs: values.length });
  }
  return rows;
}

function printTable(rows, title) {
  process.stdout.write(`\n${title}\n`);
  process.stdout.write(
    `${'stage'.padEnd(26)}${'ms'.padStart(7)}${'runs'.padStart(7)}\n`,
  );
  for (const row of rows) {
    process.stdout.write(
      `${row.stage.padEnd(26)}${String(row.ms).padStart(7)}${String(row.runs).padStart(7)}\n`,
    );
  }
}

/// The dSYM beside a packaged app, if there is one.
function findDsym(app) {
  const beside = `${app}.dSYM`;
  if (fs.existsSync(beside)) return beside;
  let directory = path.dirname(app);
  for (let i = 0; i < 6; i += 1) {
    const entries = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
    const match = entries.find(entry => entry.endsWith('.dSYM'));
    if (match !== undefined) return path.join(directory, match);
    directory = path.dirname(directory);
  }
  return undefined;
}

/// Record, export and symbolicate a Time Profiler trace.
function trace(app, keep) {
  const workDir =
    keep ?? fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-startup-'));
  fs.mkdirSync(workDir, { recursive: true });
  const tracePath = path.join(workDir, 'startup.trace');

  process.stderr.write(`recording ${tracePath}\n`);
  execFileSync(
    'xcrun',
    [
      'xctrace',
      'record',
      '--template',
      'Time Profiler',
      '--output',
      tracePath,
      '--launch',
      '--',
      app,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        RN_GPUI_SMOKE: '1',
        RN_GPUI_ALLOW_LOCKED_SCREEN: '1',
      },
    },
  );

  const xmlPath = path.join(workDir, 'time-profile.xml');
  const exported = spawnSync(
    'xcrun',
    [
      'xctrace',
      'export',
      '--input',
      tracePath,
      '--xpath',
      '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]',
    ],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );
  if (exported.status !== 0) {
    process.stderr.write(`${exported.stdout ?? ''}${exported.stderr ?? ''}`);
    throw new Error('xctrace export failed');
  }
  fs.writeFileSync(xmlPath, exported.stdout);
  process.stderr.write(`exported ${xmlPath}\n`);

  const dsym = findDsym(app);
  if (dsym === undefined) {
    process.stderr.write('no dSYM found; samples will not be symbolicated\n');
  }
  return { workDir, xmlPath, dsym };
}

/// Addresses from the export, with the load address of the app's binary.
function sampleAddresses(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const loadMatch = xml.match(
    /<binary[^>]*name="[^"]*"[^>]*load-addr="(\w+)"/u,
  );
  const loadAddress =
    loadMatch === null ? undefined : BigInt(`0x${loadMatch[1]}`);
  const addresses = [...xml.matchAll(/<frame[^>]*addr="(\w+)"/gu)].map(match =>
    BigInt(`0x${match[1]}`),
  );
  return { addresses, loadAddress };
}

function symbolicate(dsym, loadAddress, addresses) {
  if (
    dsym === undefined ||
    loadAddress === undefined ||
    addresses.length === 0
  ) {
    return [];
  }
  const dwarf = path.join(
    dsym,
    'Contents',
    'Resources',
    'DWARF',
    fs.readdirSync(path.join(dsym, 'Contents', 'Resources', 'DWARF'))[0],
  );
  const unique = [...new Set(addresses.map(address => address - loadAddress))];
  const result = spawnSync(
    'atos',
    [
      '-o',
      dwarf,
      '-l',
      `0x${loadAddress.toString(16)}`,
      ...unique.map(a => `0x${a.toString(16)}`),
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return (result.stdout ?? '').split('\n').filter(Boolean);
}

function groupSymbols(symbols) {
  const counts = new Map();
  for (const symbol of symbols) {
    const phase = PHASES.find(([pattern]) => pattern.test(symbol));
    const name = phase === undefined ? 'unclassified' : phase[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const options = parseArgs(process.argv.slice(2));
const rows = measure(options.app, options.runs);
printTable(rows, `timeline, median of ${options.runs}`);

if (options.trace) {
  if (process.platform !== 'darwin') {
    process.stderr.write('--trace needs macOS and Instruments\n');
  } else {
    const { workDir, xmlPath, dsym } = trace(options.app, options.keep);
    const { addresses, loadAddress } = sampleAddresses(xmlPath);
    const symbols = symbolicate(dsym, loadAddress, addresses);
    process.stdout.write(
      `\nmain-thread samples: ${symbols.length} (${workDir})\n`,
    );
    for (const [phase, count] of groupSymbols(symbols)) {
      process.stdout.write(`${phase.padEnd(24)}${String(count).padStart(7)}\n`);
    }
  }
}
