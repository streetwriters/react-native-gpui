import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
assert.ok(file, 'Usage: node check-native-gesture-log.mjs <log>');
const log = readFileSync(file, 'utf8');
const busyEnd = log.match(
  /\[native-gesture\] JS busy end; UI starts=(\d+) updates=(\d+) x=(-?\d+) y=(-?\d+)/,
);
assert.ok(busyEnd, 'Expected the JS-busy interval to finish with UI metrics');
assert.ok(
  Number(busyEnd[2]) > 0,
  'Expected UI worklet updates while JS was busy',
);
assert.ok(
  Number(busyEnd[3]) !== 0,
  'Expected horizontal movement during JS block',
);

const finalPosition = log.match(
  /\[native-gesture\] final position starts=(\d+) x=(-?\d+) y=(-?\d+) updates=(\d+)/,
);
assert.ok(finalPosition, 'Expected the probe to report its final pan offset');
assert.ok(
  Number(finalPosition[1]) >= 2,
  'Expected multiple native pan starts across both axes',
);
assert.ok(
  Number(finalPosition[2]) > 0,
  'Expected cumulative horizontal movement',
);
assert.ok(Number(finalPosition[3]) > 0, 'Expected vertical pan movement');
assert.ok(Number(finalPosition[4]) > Number(busyEnd[2]));
assert.doesNotMatch(
  log,
  /Unsupported top level event type|\[native-gesture\].*Error/,
);

console.log(
  'NativeGestureFixture: UI-thread updates, cumulative X/Y pans passed',
);
