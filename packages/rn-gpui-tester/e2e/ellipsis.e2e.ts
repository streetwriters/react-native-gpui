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
      RN_GPUI_MODULE: 'RNGPUITester--ellipsis',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 4000);
  await desktopExpect(app.getByTestId('tester-screen-ellipsis')).toBeVisible();
});

afterAll(() => app?.close());

async function ink(id: string) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  let right = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const o = (y * image.width + x) * 4;
      if (image.data[o] < 128 && x > right) right = x;
    }
  }
  return right / (image.width / 1);
}

test('a one-line text that fits its measured box is not cut short', async () => {
  const titles = 6;
  for (let row = 0; row < titles; row += 1) {
    for (const weight of ['400', '600', '800']) {
      for (const size of [13, 14, 15, 16, 17.5]) {
        const id = `${row}-${weight}-${size}`;
        const [cut] = await app.query('testID', `cut-${id}`, true);
        const [full] = await app.query('testID', `full-${id}`, true);
        expect(Math.abs(cut.frame.width - full.frame.width), `frame ${id}`).toBeLessThanOrEqual(0.5);
        const a = await ink(`cut-${id}`);
        const b = await ink(`full-${id}`);
        expect(a, `ink ${id}`).toBeCloseTo(b, 2);
      }
    }
  }
});

test('a text is as wide as its glyphs, to the device pixel, not rounded up to a whole point', async () => {
  const widths: number[] = [];
  for (let row = 0; row < 6; row += 1) {
    const [full] = await app.query('testID', `full-${row}-400-13`, true);
    widths.push(full.frame.width);
  }
  expect(widths.some(width => !Number.isInteger(width))).toBe(true);
  for (const width of widths) {
    expect(width * 2).toBeCloseTo(Math.round(width * 2), 3);
  }
});

test('a line is as tall as the browser makes it: ascent and descent rounded separately', async () => {
  const expected: Record<number, number> = { 13: 16, 14: 17, 15: 19, 16: 20, 17.5: 21 };
  for (const [size, height] of Object.entries(expected)) {
    const [full] = await app.query('testID', `full-0-400-${size}`, true);
    expect(full.frame.height, `height at ${size}`).toBe(height);
  }
});
