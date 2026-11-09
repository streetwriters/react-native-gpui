import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--outline-radius',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('outline-square')).toBeVisible();
});

afterAll(() => app?.close());

async function red(id: string, x: number, y: number) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  const scale = image.width / 100;
  const o = (Math.floor(y * scale) * image.width + Math.floor(x * scale)) * 4;
  return (
    image.data[o] > 200 && image.data[o + 1] < 80 && image.data[o + 2] < 80
  );
}

test('a square outline is painted into every corner', async () => {
  expect(await red('outline-square', 14.5, 14.5)).toBe(true);
  expect(await red('outline-square', 85.5, 85.5)).toBe(true);
  expect(await red('outline-square', 50, 15)).toBe(true);
  expect(await red('outline-square', 15, 50)).toBe(true);
});

test('the outline of a rounded view is rounded: its corner pixels are not painted', async () => {
  expect(await red('outline-rounded', 14.5, 14.5)).toBe(false);
  expect(await red('outline-rounded', 85.5, 14.5)).toBe(false);
  expect(await red('outline-rounded', 14.5, 85.5)).toBe(false);
  expect(await red('outline-rounded', 85.5, 85.5)).toBe(false);
  expect(await red('outline-rounded', 50, 15)).toBe(true);
  expect(await red('outline-rounded', 85, 50)).toBe(true);
});

test('only the corners that have a radius are rounded', async () => {
  expect(await red('outline-round-corners', 14.5, 14.5)).toBe(false);
  expect(await red('outline-round-corners', 85.5, 85.5)).toBe(false);
  expect(await red('outline-round-corners', 85.5, 14.5)).toBe(true);
  expect(await red('outline-round-corners', 14.5, 85.5)).toBe(true);
});

test('the ring is as wide as outlineWidth and starts outlineOffset from the edge', async () => {
  expect(await red('outline-rounded', 50, 15.5)).toBe(true);
  expect(await red('outline-rounded', 50, 19.5)).toBe(false);
  expect(await red('outline-rounded', 50, 18.5)).toBe(false);
  expect(await red('outline-rounded', 50, 13.5)).toBe(false);
});

test('a dashed outline keeps its square dashes', async () => {
  expect(await red('outline-dashed', 14.5, 14.5)).toBe(true);
});
