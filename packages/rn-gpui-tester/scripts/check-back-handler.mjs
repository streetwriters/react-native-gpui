import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let deliver;
const source = readFileSync(
  'packages/core/src-gpui/Libraries/Utilities/BackHandler.gpui.js',
  'utf8',
)
  .replace("import { DeviceEventEmitter } from 'react-native';", '')
  .replace(
    'export default BackHandler;',
    'globalThis.BackHandler = BackHandler;',
  );
const context = {
  DeviceEventEmitter: {
    addListener(name, handler) {
      assert.equal(name, 'hardwareBackPress');
      deliver = handler;
    },
  },
};
vm.runInNewContext(source, context);
const calls = [];
const handler = event => {
  calls.push('first');
  assert.equal(event.timeStamp, 64);
  return false;
};
const first = context.BackHandler.addEventListener(
  'hardwareBackPress',
  handler,
);
context.BackHandler.addEventListener('hardwareBackPress', handler);
const second = context.BackHandler.addEventListener('hardwareBackPress', () => {
  calls.push('second');
  return true;
});
deliver({ timeStamp: 64 });
assert.deepEqual(calls, ['second']);
second.remove();
second.remove();
deliver({ timeStamp: 64 });
assert.deepEqual(calls, ['second', 'first']);
first.remove();
deliver({ timeStamp: 64 });
assert.deepEqual(calls, ['second', 'first']);
context.BackHandler.exitApp();
console.log(
  'BackHandler: LIFO, consumption, deduplication, removal and unhandled back pass',
);
