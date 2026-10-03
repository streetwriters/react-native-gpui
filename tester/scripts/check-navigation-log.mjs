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
} else if (scenario === 'nav-worklet-error') {
  assert.match(log, /WorkletsError: GPUI frame exception regression/);
  assert.match(log, /\[nav-error\] JS remains alive/);
} else {
  throw new Error(`Unsupported scenario: ${scenario}`);
}
console.log(`${scenario}: log assertions passed`);
