import path from 'node:path';
import { PNG } from 'pngjs';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * Native views as host components, end to end. The fixture components create
 * AppKit views, so these run on macOS.
 */

const macOnly = process.platform === 'darwin';
/** The fixture's probe view exists on every desktop OS. */
const probeOs = ['darwin', 'linux', 'win32'].includes(process.platform);

/** How long a web view may take to report a navigation finished. */
const LOAD_TIMEOUT = 15_000;

let app: DesktopApp;

async function launch(
  module: 'NativeViewFixture' | 'WebViewFixture',
  { onScreen = false } = {},
) {
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
    offscreen: !onScreen,
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
  if (view) {
    expect(view.width).toBeCloseTo(frame.width, 0);
    expect(view.height).toBeCloseTo(frame.height, 0);
  }
}

afterAll(async () => {
  app?.disconnect();
});

test.skipIf(!probeOs)(
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

test.skipIf(!probeOs)('a native view follows a scroll', async () => {
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

test.skipIf(!probeOs)(
  'a prop change reaches the view without creating another',
  async () => {
    await launch('NativeViewFixture');
    // Where the platform reports the view's layer (macOS) read its colour;
    // the composited-pixel test below reads the colour everywhere else.
    const initial = (await surface()).view?.background;
    if (initial) expect(initial[2]).toBeCloseTo(0xad / 255, 1);

    await click('native-color-toggle');
    const changed = (await surface()).view?.background;
    if (changed) expect(changed[0]).toBeCloseTo(0xe8 / 255, 1);

    await click('native-report');
    expect(await app.getByTestId('native-status').textContent()).toBe(
      'created 1 live 1',
    );
  },
);

test.skipIf(!probeOs)(
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

test.skipIf(!probeOs)(
  'a view turned away under backfaceVisibility hidden is hidden',
  async () => {
    await launch('NativeViewFixture');
    expect((await surface()).view?.hidden ?? false).toBe(false);

    await click('native-hide-toggle');
    const hidden = await surface();
    expect(hidden.visible).toBe(false);
    if (hidden.view) expect(hidden.view.hidden).toBe(true);

    await click('native-hide-toggle');
    const shown = await surface();
    expect(shown.visible).toBe(true);
    if (shown.view) expect(shown.view.hidden).toBe(false);
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

test.skipIf(!probeOs)(
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

type Rgb = [number, number, number];

const COLOR_TOLERANCE = 6;

const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(
    255 *
      (clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * clamped ** (1 / 2.4) - 0.055),
  );
};

/**
 * What the capture reads for an sRGB colour. The compositor hands the window
 * back in Display P3, whose primaries differ from sRGB's.
 */
function inDisplayP3([red, green, blue]: Rgb): Rgb {
  const [r, g, b] = [red, green, blue].map(toLinear);
  return [
    fromLinear(0.8225 * r + 0.1774 * g),
    fromLinear(0.0332 * r + 0.9669 * g),
    fromLinear(0.0171 * r + 0.0724 * g + 0.9108 * b),
  ];
}

/** The composited window, read by logical window coordinates. */
async function composited() {
  const shot = await app.compositeScreenshot();
  const png = PNG.sync.read(shot.png);
  // The capture includes the title bar the viewport leaves out.
  const top = png.height / shot.scale - shot.viewport.height;
  return (x: number, y: number): Rgb => {
    const column = Math.round(x * shot.scale);
    const row = Math.round((y + top) * shot.scale);
    const at = (row * png.width + column) * 4;
    return [png.data[at], png.data[at + 1], png.data[at + 2]];
  };
}

function expectColor(actual: Rgb, srgb: Rgb) {
  const expected = macOnly ? inDisplayP3(srgb) : srgb;
  const close = actual.every(
    (channel, index) => Math.abs(channel - expected[index]) <= COLOR_TOLERANCE,
  );
  expect(close, `rgb(${actual}) is not rgb(${expected})`).toBe(true);
}

test.skipIf(!probeOs)(
  'the compositor shows the native view, and a React view above it covering it',
  async () => {
    await launch('NativeViewFixture', { onScreen: true });
    const PROBE: Rgb = [0x14, 0x7a, 0xad];
    const OVERLAY: Rgb = [0xd9, 0x46, 0xef];
    const host = await frameOf('native-view-host');
    const clear = {
      x: host.x + host.width - 30,
      y: host.y + host.height - 30,
    };

    let pixel = await composited();
    expectColor(pixel(clear.x, clear.y), PROBE);

    await click('native-overlay-toggle');
    const overlay = await frameOf('native-view-overlay');
    const covered = { x: overlay.x + 20, y: overlay.y + 20 };
    pixel = await composited();
    expectColor(pixel(covered.x, covered.y), OVERLAY);
    expectColor(pixel(clear.x, clear.y), PROBE);

    await click('native-overlay-toggle');
    pixel = await composited();
    expectColor(pixel(covered.x, covered.y), PROBE);

    // Painted after the view, but outside its bounds: still drawn.
    await click('native-after-toggle');
    const strip = await frameOf('native-after');
    const shrunk = await frameOf('native-view-host');
    expect(strip.y).toBeGreaterThanOrEqual(shrunk.y + shrunk.height);
    pixel = await composited();
    expectColor(pixel(strip.x + 40, strip.y + 20), [0xf5, 0x9e, 0x0b]);

    // A prop change repaints the view.
    await click('native-color-toggle');
    const tall = await frameOf('native-view-host');
    pixel = await composited();
    expectColor(
      pixel(tall.x + tall.width - 30, tall.y + tall.height - 30),
      [0xe8, 0x74, 0x3b],
    );
  },
);
