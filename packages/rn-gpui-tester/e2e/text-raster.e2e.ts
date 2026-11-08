import fs from 'node:fs';
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
      RN_GPUI_MODULE: 'RNGPUITester--text-raster',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-text-raster'),
  ).toBeVisible();
});

afterAll(() => app?.close());

/**
 * How far a text's pixels are from Chromium's: the share over a perceptual
 * threshold, and the total ink relative to the background.
 */
async function differing(id: string, golden: string, columns = Infinity) {
  const mine = PNG.sync.read(await app.getByTestId(id).screenshot());
  const reference = PNG.sync.read(
    fs.readFileSync(path.resolve('packages/rn-gpui-tester/e2e/golden', golden)),
  );
  if (process.env.RASTER_DUMP) {
    fs.writeFileSync(
      path.resolve('.local/text', `mine-${id}.png`),
      PNG.sync.write(mine),
    );
  }
  expect(mine.width).toBeGreaterThanOrEqual(reference.width - 2);
  const background = reference.data[0];
  const width = Math.min(reference.width, columns);
  let over = 0;
  let referenceInk = 0;
  let mineInk = 0;
  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = reference.data[(y * reference.width + x) * 4];
      const b =
        x < mine.width && y < mine.height
          ? mine.data[(y * mine.width + x) * 4]
          : background;
      if (Math.abs(a - b) > 25) over += 1;
      referenceInk += Math.abs(background - a);
      mineInk += Math.abs(background - b);
    }
  }
  return {
    over,
    total: width * reference.height,
    ink: mineInk / referenceInk,
  };
}

function expectLikeChromium(result: {
  over: number;
  total: number;
  ink: number;
}) {
  expect(result.ink).toBeGreaterThan(0.97);
  expect(result.ink).toBeLessThan(1.03);
  expect(result.over).toBeLessThan(result.total * 0.01);
}

test('13 point regular text matches the pixels Chromium paints', async () => {
  expectLikeChromium(
    await differing('raster-13-400', 'chromium-inter-13-400-favorites.png'),
  );
});

test('15 point semibold text matches the pixels Chromium paints', async () => {
  expectLikeChromium(
    await differing('raster-15-600', 'chromium-inter-15-600-meeting-notes.png'),
  );
});

test('wrapped 13 point text with a 19.2 point line height matches Chromium', async () => {
  expectLikeChromium(
    await differing(
      'raster-description',
      'chromium-inter-13-400-description.png',
    ),
  );
});

test('light text on a dark background matches Chromium', async () => {
  expectLikeChromium(
    await differing(
      'raster-dark-13-400',
      'chromium-dark-inter-13-400-favorites.png',
    ),
  );
  expectLikeChromium(
    await differing(
      'raster-dark-15-600',
      'chromium-dark-inter-15-600-meeting-notes.png',
    ),
  );
});

test('a one-line title nested in a bordered, padded row matches Chromium', async () => {
  expectLikeChromium(
    await differing(
      'raster-nested-title',
      'chromium-inter-15-600-meeting-notes.png',
    ),
  );
});

test('a child of a bordered parent is painted where its frame says', async () => {
  const [child] = await app.query('testID', 'bordered-child', true);
  const image = PNG.sync.read(await app.screenshot());
  const scale = image.width / 1024;
  const dark = (x: number, y: number) =>
    image.data[
      (Math.round(y * scale) * image.width + Math.round(x * scale)) * 4
    ] < 60;
  const { x, y, width, height } = child.frame;
  expect(dark(x + 1, y + height / 2)).toBe(true);
  expect(dark(x - 1, y + height / 2)).toBe(false);
  expect(dark(x + width / 2, y + 1)).toBe(true);
  expect(dark(x + width / 2, y - 1)).toBe(false);
});
