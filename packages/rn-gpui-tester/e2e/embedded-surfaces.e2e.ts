import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * React surfaces inside a GPUI layout (design 2, direction A), end to end.
 *
 * The app under test is the tester's GPUI-first example
 * (`desktop/src/gpui_first.rs`): a window that is a GPUI layout, with three
 * `ReactSurface`s in it — a `Fill` sidebar, a `FitContent` panel, and a `Fill`
 * panel below that one. Everything asserted here is a number a test can compute
 * from the layout: where each surface's content sits in the window, how big a
 * `FitContent` surface is, and where the surface below it starts.
 *
 *   x: 0 .. 240 | 240 ..            y: 0 .. 32   GPUI header
 *   side (Fill) | fit (FitContent)  y: 32 ..
 *               | below (Fill)      y: 32 + fit height ..
 */

const HEADER = 32;
const SIDEBAR = 240;
/** The fit panel: a 24-high button, an 8-high target, a 20-high label, and 22 per row. */
const fitHeight = (rows: number) => 24 + 8 + 20 + rows * 22;

let app: DesktopApp;

async function launchExample(width = 1024, height = 768) {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_GPUI_FIRST_EXAMPLE: '1',
      RN_GPUI_BUNDLE: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-gpui-first-example.json'),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(width, height);
  await app.waitForIdle();
  return app;
}

async function node(testID: string) {
  const [found] = await app.query('testID', testID, true);
  if (!found) throw new Error(`no node for ${testID}`);
  return found as { tag: number; frame: Frame };
}

type Frame = { x: number; y: number; width: number; height: number };

async function frameOf(testID: string): Promise<Frame> {
  return (await node(testID)).frame;
}

async function textOf(testID: string) {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

afterAll(async () => {
  app?.disconnect();
});

test('a Fill surface takes the box GPUI gave it, and its nodes report window coordinates', async () => {
  await launchExample(1024, 768);
  // The sidebar is 240 wide and runs from under the header to the window's
  // bottom. Its React root fills it, and the root's frame is in *window*
  // coordinates: the surface is not at the window's origin, so its nodes' origin
  // is the box GPUI placed it in.
  expect(await frameOf('side-root')).toEqual({
    x: 0,
    y: HEADER,
    width: SIDEBAR,
    height: 768 - HEADER,
  });
  // A node inside the surface is offset by the same box: the first target sits
  // after the padding (8), the title (17.x) and the label.
  const first = await frameOf('side-first');
  expect(first.x).toBe(8);
  expect(first.y).toBeGreaterThan(HEADER);
  expect(first.width).toBe(SIDEBAR - 16);
});

test('a FitContent surface is as big as its React content', async () => {
  await launchExample();
  expect(await frameOf('fit-root')).toEqual({
    x: SIDEBAR,
    y: HEADER,
    width: 180,
    height: fitHeight(2),
  });
});

test('GPUI lays out around a FitContent surface when its content grows', async () => {
  await launchExample(1024, 768);
  const below = await frameOf('below-root');
  expect(below.y).toBe(HEADER + fitHeight(2));
  expect(below.x).toBe(SIDEBAR);
  expect(below.height).toBe(768 - HEADER - fitHeight(2));

  // One more row of React content: the surface asks for 22 more, GPUI re-lays
  // out, and the surface below it moves down and gets shorter by the same.
  await app.click((await node('fit-grow')).tag);
  await app.waitForIdle();
  expect((await frameOf('fit-root')).height).toBe(fitHeight(3));
  const moved = await frameOf('below-root');
  expect(moved.y).toBe(HEADER + fitHeight(3));
  expect(moved.height).toBe(768 - HEADER - fitHeight(3));
  // Nothing else moved.
  expect((await frameOf('side-root')).height).toBe(768 - HEADER);
});

test('resizing the window resizes every Fill surface and leaves the fit one alone', async () => {
  await launchExample(1024, 768);
  await app.setWindowSize(900, 600);
  await app.waitForIdle();
  expect(await frameOf('side-root')).toEqual({
    x: 0,
    y: HEADER,
    width: SIDEBAR,
    height: 600 - HEADER,
  });
  const below = await frameOf('below-root');
  expect(below.width).toBe(900 - SIDEBAR);
  expect(below.height).toBe(600 - HEADER - fitHeight(2));
  expect((await frameOf('fit-root')).height).toBe(fitHeight(2));
});

test('Tab leaves one surface for the next in tree order, instead of wrapping', async () => {
  await launchExample();
  // A focus event does not reach JS from a test app, but a key reaches whatever
  // holds focus. So each stop is read by pressing a key and seeing which target
  // received it.
  const holder = async () => {
    await app.press('x');
    await app.waitForIdle();
  };

  await app.focus((await node('side-first')).tag);
  await holder();
  expect(await textOf('side-focus')).toContain('focused=first');

  await app.press('tab');
  await holder();
  expect(await textOf('side-focus')).toContain('focused=second');

  // The sidebar's last focusable: the next stop is in the fit surface, not the
  // sidebar's first target again.
  await app.press('tab');
  await holder();
  expect(await textOf('fit-focus')).toContain('focused=target');

  // And on into the surface below.
  await app.press('tab');
  await holder();
  expect(await textOf('below-focus')).toContain('focused=first');
});
