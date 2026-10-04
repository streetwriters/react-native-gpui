import fs from 'node:fs';

const [mode, logPath] = process.argv.slice(2);
if (!['tap', 'longPress'].includes(mode) || !logPath) {
  console.error(
    'Usage: node check-native-gesture-basic-log.mjs <tap|longPress> <log-file>',
  );
  process.exit(2);
}

const log = fs.readFileSync(logPath, 'utf8');
const countSamples = [
  ...log.matchAll(/\[native-gesture-basic\] tap=(\d+) longPress=(\d+)/g),
];
if (countSamples.length === 0) {
  console.error('NativeGestureBasicProbe: missing UI worklet counts');
  process.exit(1);
}

const observed = countSamples.map(counts =>
  Number(mode === 'tap' ? counts[1] : counts[2]),
);
if (Math.max(...observed) < 1) {
  console.error(`NativeGestureBasicProbe: ${mode} callback did not run`);
  process.exit(1);
}

const busyStart = log.indexOf('[native-gesture-basic] JS busy start');
const busyEnd = log.indexOf('[native-gesture-basic] JS busy end');
const gestureEvent = log.lastIndexOf('[native-gesture-basic] tap=');
if (busyStart < 0 || busyEnd < busyStart || gestureEvent < busyEnd) {
  console.error('NativeGestureBasicProbe: incomplete JS-busy/UI-worklet trace');
  process.exit(1);
}

if (mode === 'longPress') {
  const activated = log.indexOf('[gesture-handler] long-press threshold');
  const released = log.indexOf('pointer phase=2 at (500,310)');
  if (activated < busyStart || released < activated || activated > busyEnd) {
    console.error(
      'NativeGestureBasicProbe: long press did not activate while held during the JS busy interval',
    );
    process.exit(1);
  }
}

console.log(`NativeGestureBasicProbe: ${mode} worklet callback passed`);
