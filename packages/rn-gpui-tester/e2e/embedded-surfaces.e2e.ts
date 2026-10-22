import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * React surfaces inside a GPUI layout, end to end.
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
  expect(await frameOf('side-root')).toEqual({
    x: 0,
    y: HEADER,
    width: SIDEBAR,
    height: 768 - HEADER,
  });
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

  await app.click((await node('fit-grow')).tag);
  await app.waitForIdle();
  expect((await frameOf('fit-root')).height).toBe(fitHeight(3));
  const moved = await frameOf('below-root');
  expect(moved.y).toBe(HEADER + fitHeight(3));
  expect(moved.height).toBe(768 - HEADER - fitHeight(3));
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

  await app.press('tab');
  await holder();
  expect(await textOf('fit-focus')).toContain('focused=target');

  await app.press('tab');
  await holder();
  expect(await textOf('below-focus')).toContain('focused=first');
});
