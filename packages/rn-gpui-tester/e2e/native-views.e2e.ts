import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * Native views as host components, end to end. The fixture components create
 * AppKit views, so these run on macOS.
 */

const macOnly = process.platform === 'darwin';

/** How long a web view may take to report a navigation finished. */
const LOAD_TIMEOUT = 15_000;

let app: DesktopApp;

async function launch(module: 'NativeViewFixture' | 'WebViewFixture') {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: module,
      RN_GPUI_BUNDLE: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(`.local/e2e-${module}.json`),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await app.waitForIdle();
  return app;
}

async function frameOf(testID: string) {
  const [node] = await app.query('testID', testID, true);
  if (!node) throw new Error(`no node for ${testID}`);
  return node.frame;
}

async function click(testID: string) {
  const [node] = await app.query('testID', testID, true);
  if (!node) throw new Error(`no node for ${testID}`);
  await app.click((node as { tag: number }).tag);
  await app.waitForIdle();
}

async function surface() {
  const surfaces = await app.nativeSurfaces();
  expect(surfaces).toHaveLength(1);
  return surfaces[0];
}

async function expectAtLayoutBounds() {
  const frame = await frameOf('native-view-host');
  const { bounds, view } = await surface();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(frame.x, 0);
  expect(bounds!.y).toBeCloseTo(frame.y, 0);
  expect(bounds!.width).toBeCloseTo(frame.width, 0);
  expect(bounds!.height).toBeCloseTo(frame.height, 0);
  expect(view!.width).toBeCloseTo(frame.width, 0);
  expect(view!.height).toBeCloseTo(frame.height, 0);
}

afterAll(async () => {
  app?.disconnect();
});

test.skipIf(!macOnly)(
  'a native view is placed at its layout bounds and follows a resize',
  async () => {
    await launch('NativeViewFixture');
    await expectAtLayoutBounds();
    const before = await frameOf('native-view-host');
    expect(before.width).toBeGreaterThan(400);

    await app.setWindowSize(900, 700);
    await app.waitForIdle();
    await expectAtLayoutBounds();
    expect((await frameOf('native-view-host')).width).toBeLessThan(
      before.width,
    );
  },
);

test.skipIf(!macOnly)('a native view follows a scroll', async () => {
  await launch('NativeViewFixture');
  await click('native-scroll-toggle');
  await expectAtLayoutBounds();
  const before = await frameOf('native-view-host');

  const [scroll] = await app.query('testID', 'native-scroll', true);
  await app.scroll((scroll as { tag: number }).tag, 0, -40, 3);
  await app.waitForIdle();
  const after = await frameOf('native-view-host');
  expect(after.y).toBeLessThan(before.y);
  await expectAtLayoutBounds();
});

test.skipIf(!macOnly)(
  'a prop change reaches the view without creating another',
  async () => {
    await launch('NativeViewFixture');
    const initial = (await surface()).view!.background;
    expect(initial[2]).toBeCloseTo(0xad / 255, 1);

    await click('native-color-toggle');
    const changed = await surface();
    expect(changed.view!.background[0]).toBeCloseTo(0xe8 / 255, 1);

    await click('native-report');
    expect(await app.getByTestId('native-status').textContent()).toBe(
      'created 1 live 1',
    );
  },
);

test.skipIf(!macOnly)(
  'unmounting releases the view and mounting creates a fresh one',
  async () => {
    await launch('NativeViewFixture');
    expect(await app.compositionLayerCount()).toBe(3);
    await click('native-mount-toggle');
    expect(await app.nativeSurfaces()).toHaveLength(0);
    expect(await app.compositionLayerCount()).toBe(2);

    await click('native-mount-toggle');
    await expectAtLayoutBounds();
    await click('native-report');
    expect(await app.getByTestId('native-status').textContent()).toBe(
      'created 2 live 1',
    );
  },
);

test.skipIf(!macOnly)(
  'a view turned away under backfaceVisibility hidden is hidden',
  async () => {
    await launch('NativeViewFixture');
    expect((await surface()).view!.hidden).toBe(false);

    await click('native-hide-toggle');
    const hidden = await surface();
    expect(hidden.visible).toBe(false);
    expect(hidden.view!.hidden).toBe(true);

    await click('native-hide-toggle');
    const shown = await surface();
    expect(shown.visible).toBe(true);
    expect(shown.view!.hidden).toBe(false);
    await expectAtLayoutBounds();
  },
);

test.skipIf(!macOnly)(
  'a web view reports start and finish in order, on a prop change and a command',
  async () => {
    await launch('WebViewFixture');
    await expectAtLayoutBounds();
    const [first] = await app.nativeSurfaces();
    const status = () => app.getByTestId('native-status').textContent();

    // `onLoad` comes from the web view's own navigation callback, long after
    // the call that started the load returned.
    await expect.poll(status, { timeout: LOAD_TIMEOUT }).toBe('start,load');

    await click('native-reload');
    await expect
      .poll(status, { timeout: LOAD_TIMEOUT })
      .toBe('start,load,start,load');

    await click('native-page-toggle');
    await expect
      .poll(status, { timeout: LOAD_TIMEOUT })
      .toBe('start,load,start,load,start,load');
    const [after] = await app.nativeSurfaces();
    expect(after.tag).toBe(first.tag);
  },
);

test.skipIf(!macOnly)(
  'an event sent after the node unmounted is dropped',
  async () => {
    await launch('WebViewFixture');
    await expect
      .poll(() => app.getByTestId('native-status').textContent(), {
        timeout: LOAD_TIMEOUT,
      })
      .toBe('start,load');

    // The component sends one more event from its destructor.
    await app.hostCounters({ reset: true });
    await click('native-mount-toggle');
    await app.waitForIdle();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect((await app.hostCounters()).hostReportsDelivered).toBe(0);
  },
);

test.skipIf(!macOnly)(
  'views painted after a native view are drawn above it and those before it below',
  async () => {
    await launch('NativeViewFixture');
    const plain = await surface();
    expect(plain.aboveOps).toBe(0);

    await click('native-overlay-toggle');
    const over = await surface();
    expect(over.aboveOps).toBeGreaterThan(0);
    expect(over.baseOps).toBe(plain.baseOps);

    await click('native-overlay-toggle');
    expect((await surface()).aboveOps).toBe(0);

    await click('native-underlay-toggle');
    const under = await surface();
    expect(under.aboveOps).toBe(0);
    expect(under.baseOps).toBeGreaterThan(plain.baseOps);
  },
);
