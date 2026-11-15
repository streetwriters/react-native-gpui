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

type Frame = { x: number; y: number; width: number; height: number };

// One window screenshot serves every element: a screenshot per element is a
// full render and PNG round trip each, which took minutes on Windows. Returns
// the right-most dark pixel of a frame, in pixels from its left edge.
function ink(shot: PNG, frame: Frame) {
  const scale = shot.width / 1024;
  const left = Math.max(0, Math.floor(frame.x * scale));
  const top = Math.max(0, Math.floor(frame.y * scale));
  const right = Math.min(
    shot.width,
    Math.ceil((frame.x + frame.width) * scale),
  );
  const bottom = Math.min(
    shot.height,
    Math.ceil((frame.y + frame.height) * scale),
  );
  let edge = -1;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (shot.data[(y * shot.width + x) * 4] < 128 && x - left > edge)
        edge = x - left;
    }
  }
  return edge / (right - left);
}

test('a one-line text that fits its measured box is not cut short', async () => {
  const titles = 6;
  const shot = PNG.sync.read(await app.screenshot());
  for (let row = 0; row < titles; row += 1) {
    for (const weight of ['400', '600', '800']) {
      for (const size of [13, 14, 15, 16, 17.5]) {
        const id = `${row}-${weight}-${size}`;
        const [cut] = await app.query('testID', `cut-${id}`, true);
        const [full] = await app.query('testID', `full-${id}`, true);
        expect(
          Math.abs(cut.frame.width - full.frame.width),
          `frame ${id}`,
        ).toBeLessThanOrEqual(0.5);
        const a = ink(shot, cut.frame);
        const b = ink(shot, full.frame);
        expect(a, `ink ${id}`).toBeCloseTo(b, 2);
      }
    }
  }
}, 240_000);

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

test('a line is as tall as the browser makes it: ascent and descent rounded to device pixels', async () => {
  const expected: Record<number, number> = {
    13: 15.5,
    14: 17,
    15: 18,
    16: 19.5,
    17.5: 21,
  };
  for (const [size, height] of Object.entries(expected)) {
    const [full] = await app.query('testID', `full-0-400-${size}`, true);
    expect(full.frame.height, `height at ${size}`).toBe(height);
  }
});
