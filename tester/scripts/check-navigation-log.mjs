import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [scenario, file] = process.argv.slice(2);
assert.ok(file, 'Usage: node check-navigation-log.mjs <scenario> <log>');
const log = readFileSync(file, 'utf8');
assert.doesNotMatch(log, /libc\+\+abi: terminating|Thread 0 Crashed/);
if (scenario === 'nav-drawer') {
  assert.doesNotMatch(
    log,
    /WorkletsError|Tried to synchronously call a Remote Function/,
  );
  // With RN_GPUI_DEBUG_ANIMATION=1, detect the former mount/animation
  // feedback loop (60 ticks in ~3 ms rather than display cadence).
  const frameWindows = [
    ...log.matchAll(/native frame cadence frames=60 elapsed_ms=([\d.]+)/g),
  ];
  for (const [, elapsed] of frameWindows) {
    assert.ok(
      Number(elapsed) >= 100,
      `Animation feedback loop: 60 ticks in ${elapsed} ms`,
    );
  }
  let position = 0;
  assert.match(log, /\[nav\] focus List/);
  for (const expected of [
    '[nav] drawer status=open',
    '[nav] drawer status=closed',
    '[nav] drawer status=open',
    '[nav] drawer status=closed',
  ]) {
    const found = log.indexOf(expected, position);
    assert.ok(found >= 0, `Missing or out-of-order event: ${expected}`);
    position = found + expected.length;
  }
} else if (scenario === 'nav-stack') {
  const expectedStates = [
    'Home',
    'Details title=Details 1',
    'Details title=Details 2',
    'Details title=Details 1',
    'Home',
  ];
  let position = 0;
  for (const expected of expectedStates) {
    const found = log.indexOf(`[nav] stack state route=${expected}`, position);
    assert.ok(found >= 0, `Missing or out-of-order stack state: ${expected}`);
    position = found + expected.length;
  }
  const transitionTimes = new Map();
  const elapsedTransitions = [];
  for (const [, timestamp, phase, route, closing] of log.matchAll(
    /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z).*?\[nav\] stack transition (start|end) route=(\w+) closing=(\w+)/gm,
  )) {
    const key = `${route}:${closing}`;
    const time = Date.parse(timestamp);
    if (phase === 'start') {
      const pending = transitionTimes.get(key) ?? [];
      pending.push(time);
      transitionTimes.set(key, pending);
    } else {
      const pending = transitionTimes.get(key) ?? [];
      const startedAt = pending.shift();
      if (startedAt !== undefined) elapsedTransitions.push(time - startedAt);
    }
  }
  assert.ok(
    elapsedTransitions.filter(duration => duration >= 80).length >= 2,
    `Expected two completed animated pushes, observed transition durations: ${elapsedTransitions.join(', ')}`,
  );
  for (const [phase, closing, minimum] of [
    ['start', 'false', 2],
    ['end', 'false', 2],
  ]) {
    const count = [
      ...log.matchAll(
        new RegExp(
          `\\[nav\\] stack transition ${phase} route=\\w+ closing=${closing}`,
          'g',
        ),
      ),
    ].length;
    assert.ok(
      count >= minimum,
      `Expected at least ${minimum} stack transition ${phase} closing=${closing} events, received ${count}`,
    );
  }
  assert.doesNotMatch(log, /WorkletsError|libc\+\+abi: terminating/);
} else if (scenario === 'nav-worklet-error') {
  assert.match(log, /WorkletsError: GPUI frame exception regression/);
  assert.match(log, /\[nav-error\] JS remains alive/);
} else {
  throw new Error(`Unsupported scenario: ${scenario}`);
}
console.log(`${scenario}: log assertions passed`);
