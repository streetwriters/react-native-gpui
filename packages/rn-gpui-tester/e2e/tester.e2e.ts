import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';
let app: DesktopApp;
async function launch(screen?: string) {
  if (app) await app.close();
  app = await launchApp({
    // The e2e runner bundles the test entry to test-e2e.bundle; index.bundle is
    // whatever the last manual run-desktop left behind.
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: screen ? `RNGPUITester--${screen}` : 'RNGPUITester',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1280, 900);
}
afterAll(() => app?.disconnect());
test('default tester screen has a menu and switches to text', async () => {
  await launch();
  await desktopExpect(app.getByTestId('tester-menu')).toBeVisible();
  await desktopExpect(app.getByTestId('tester-overview')).toBeVisible();
  await app.getByTestId('tester-menu-text').click();
  await desktopExpect(app.getByTestId('tester-screen-text')).toBeVisible();
});
for (const [screen, result] of [
  ['rust-turbomodule', 'Autolinked Rust'],
  ['cpp-turbomodule', 'C++'],
] as const) {
  test(`${screen} starts directly and returns a native result`, async () => {
    await launch(screen);
    await desktopExpect(
      app.getByTestId(`tester-screen-${screen}`),
    ).toBeVisible();
    await app.getByTestId('native-module-run').click();
    const nodes = await app.query('testID', 'native-module-result', true);
    expect(JSON.stringify(nodes)).toContain(result);
  });
}
test('the Rust TurboModule runs off the JS thread and delivers events', async () => {
  await launch('rust-turbomodule');
  await desktopExpect(
    app.getByTestId('tester-screen-rust-turbomodule'),
  ).toBeVisible();
  await app.getByTestId('native-module-run').click();
  const timeout = 15_000;
  await desktopExpect(app.getByTestId('native-module-result')).toContainText(
    'sync: Autolinked Rust says hi to GPUI Tester.',
  );
  await desktopExpect(app.getByTestId('rust-add')).toContainText(
    'add: 3 + 4 = 7',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-summary')).toContainText(
    'summary: total=6 label=unlabelled tags=a,b',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-async-greeting')).toContainText(
    'async: Later, GPUI Tester.',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-rejection')).toContainText(
    'rejected: E_FIXTURE: GPUI rust failure',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-note-js-thread')).toContainText(
    'noteJsThread: true',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-ran-off-js-thread')).toContainText(
    'ranOffJsThread: true',
    timeout,
  );
  // The middle call passes the optional tag; the other two omit it.
  await desktopExpect(app.getByTestId('rust-void-promise')).toContainText(
    'finish: finish resolved',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-lookup-later')).toContainText(
    'lookupLater: called dropped=dropped calls=later:gpui|found=true',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-bytes')).toContainText(
    'bytes: sum=256 reversed=250,3,2,1',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-on-done')).toContainText(
    'onDone: onDone=1',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-recorded')).toContainText(
    'recorded: one,two#tagged,three',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-counts')).toContainText(
    'nextCount: 1 then 2',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-block-counter')).toContainText(
    'blockFor: ticks=advanced resolved=300',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-ran-on-main-thread')).toContainText(
    'ranOnMainThread: true',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-lookup')).toContainText(
    'lookup: value:gpui|found=true',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-progress')).toContainText(
    'onProgress: received=1,2,3 afterRemove=1,2,3',
    timeout,
  );
  await desktopExpect(app.getByTestId('rust-tick')).toContainText(
    'fixtureTick: {"n":1}',
    timeout,
  );
});
test('the C++ TurboModule runs off the JS thread and delivers events', async () => {
  await launch('cpp-turbomodule');
  await desktopExpect(
    app.getByTestId('tester-screen-cpp-turbomodule'),
  ).toBeVisible();
  await app.getByTestId('native-module-run').click();
  const timeout = 15_000;
  await desktopExpect(app.getByTestId('native-module-result')).toContainText(
    'sync: Hello from C++, GPUI Tester!',
  );
  await desktopExpect(app.getByTestId('cpp-async-greeting')).toContainText(
    'async: Hello from C++, GPUI Tester!',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-rejection')).toContainText(
    'rejected: E_FIXTURE: GPUI async failure',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-ran-off-js-thread')).toContainText(
    'ranOffJsThread: true',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-void-promise')).toContainText(
    'finish: finish resolved',
    timeout,
  );
  // record() is queued ahead of greetLater() on the same module thread, so the
  // list is complete when the greeting resolves. The middle call passes the
  // optional tag; the other two omit it.
  await desktopExpect(app.getByTestId('cpp-recorded')).toContainText(
    'recorded: one,two#tagged,three',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-block-counter')).toContainText(
    'blockFor: ticks=advanced resolved=300',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-ran-on-main-thread')).toContainText(
    'ranOnMainThread: true',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-on-done')).toContainText(
    'onDone: onDone=1',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-lookup')).toContainText(
    'lookup: value:gpui|found=true',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-lookup-later')).toContainText(
    'lookupLater: called dropped=dropped calls=later:gpui|found=true',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-bytes')).toContainText(
    'bytes: sum=256 reversed=250,3,2,1',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-progress')).toContainText(
    'onProgress: received=1,2,3 afterRemove=1,2,3',
    timeout,
  );
  await desktopExpect(app.getByTestId('cpp-tick')).toContainText(
    'cppExampleTick: {"n":1}',
    timeout,
  );
});
test('reloading while module calls are pending keeps the app alive', async () => {
  await launch('cpp-turbomodule');
  await desktopExpect(
    app.getByTestId('tester-screen-cpp-turbomodule'),
  ).toBeVisible();
  await app.getByTestId('native-module-run').click();
  await desktopExpect(app.getByTestId('native-module-result')).toContainText(
    'sync: Hello from C++, GPUI Tester!',
  );
  // The fixture's remaining calls (including blockFor(300)) are still queued on
  // the module thread, so the reload races a running module call. Destroying
  // the module on that thread would release JSI state after the runtime is
  // gone and kill the process.
  await app.reload();
  await desktopExpect(
    app.getByTestId('tester-screen-cpp-turbomodule'),
  ).toBeVisible();
  await app.getByTestId('native-module-run').click();
  await desktopExpect(app.getByTestId('native-module-result')).toContainText(
    'sync: Hello from C++, GPUI Tester!',
    15_000,
  );
});
test('custom Fabric component renders inside the tester', async () => {
  await launch('gpui-component');
  await desktopExpect(
    app.getByTestId('tester-screen-gpui-component'),
  ).toBeVisible();
});
test.skipIf(process.platform === 'win32')(
  'a stock Node-API addon handles sync, async and thread-safe calls',
  async () => {
    await launch('node-api');
    await app.getByTestId('native-module-run').click();
    await app.waitForIdle();
    const nodes = await app.query('testID', 'native-module-result', true);
    // 19 + 23 synchronous, 20 + 22 through napi_create_async_work, and 42
    // dispatched from a worker thread through a thread-safe function.
    expect(JSON.stringify(nodes)).toContain('42 / 42 / tsfn 42');
  },
);
test('unmodified npm Node-API packages load through every loader pattern', async () => {
  await launch('node-api-packages');
  await app.getByTestId('native-module-run').click();
  await app.waitForIdle();
  const nodes = await app.query('testID', 'native-module-result', true);
  const text = JSON.stringify(nodes);
  // `@node-rs/crc32` (napi-rs generated loader) and `farmhash` (a static
  // `build/Release` require) both hash the string "hello", so their values are
  // fixed; `microtime` (`require('node-gyp-build')`) reports whether its
  // clock read back a plausible timestamp. farmhash's `fingerprint32` is used
  // rather than `hash32` because the package documents the `hash*` family as
  // platform dependent and the `fingerprint*` family as not: `hash32('hello')`
  // is 3111026382 on darwin-arm64 but 2535641019 on linux-x64.
  expect(text).toContain('crc32=907060870');
  expect(text).toContain('farmhash=2039911270');
  expect(text).toContain('microtime=ok');
});
test('scrolling the menu composites instead of rebuilding its rows', async () => {
  await launch();
  // The menu's ScrollView has no testID of its own, so scroll a row inside it;
  // the wheel reaches the ScrollView that contains the pointer.
  const [row] = await app.query('testID', 'tester-menu-overview', true);
  expect(row?.tag).toBeTypeOf('number');
  const metrics = await app.scroll(row.tag, 0, -12, 40);
  console.log(
    `[scroll-perf] renderedViews=${metrics.renderedViews} ` +
      `renderedViewsTotal=${metrics.renderedViewsTotal} ` +
      `drawMs=${metrics.drawMs.toFixed(2)} a11y=${metrics.a11yActive}`,
  );
  // gpui-fast keeps its scroll layers off while an accessibility client is
  // attached, so every frame rebuilds its content and there is nothing to
  // assert.
  if (metrics.a11yActive) return;
  expect(metrics.renderedViews).toBeLessThanOrEqual(2);
  // The 40 frames still rebuild the ScrollView once each and the whole menu
  // about twice; rebuilding every row on every frame measures in the thousands.
  expect(metrics.renderedViewsTotal).toBeLessThan(40 * 12);
});
