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
      RN_GPUI_MODULE: 'RNGPUITester--rounded-clip',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-rounded-clip'),
  ).toBeVisible();
});

afterAll(() => app?.close());

/** The width in points of the red run along the middle row of a 200 point slot. */
async function across(id: string, y = 0.5) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  const row = Math.round(image.height * y);
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x += 1) {
    const o = (row * image.width + x) * 4;
    if (image.data[o] > 200 && image.data[o + 1] < 100) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return ((last - first + 1) * 200) / image.width;
}

test('a scaled view that clips to its rounded corners shows the scaled circle', async () => {
  expect(Math.round(await across('clip-plain'))).toBe(140);
  expect(Math.round(await across('clip-radius-bg'))).toBe(140);
  expect(Math.round(await across('clip-radius-hidden'))).toBe(140);
  expect(Math.round(await across('clip-rect'))).toBe(140);
  expect(Math.round(await across('clip-shrunk'))).toBe(70);
  expect(Math.round(await across('clip-translated'))).toBe(100);
});

test('the clip keeps its rounded corners when scaled', async () => {
  const near = await across('clip-radius-hidden', 0.25);
  expect(near).toBeGreaterThan(90);
  expect(near).toBeLessThan(105);
});
