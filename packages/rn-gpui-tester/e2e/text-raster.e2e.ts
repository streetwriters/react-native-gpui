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
  let over = 0;
  const width = Math.min(reference.width, columns);
  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = reference.data[(y * reference.width + x) * 4];
      const b =
        x < mine.width && y < mine.height
          ? mine.data[(y * mine.width + x) * 4]
          : 255;
      if (Math.abs(a - b) > 25) over += 1;
    }
  }
  return { over, total: width * reference.height };
}

test('13 point regular text matches the pixels Chromium paints', async () => {
  const { over, total } = await differing(
    'raster-13-400',
    'chromium-inter-13-400-favorites.png',
  );
  expect(over).toBeLessThan(total * 0.02);
});

test('15 point semibold text matches the pixels Chromium paints', async () => {
  const { over, total } = await differing(
    'raster-15-600',
    'chromium-inter-15-600-meeting-notes.png',
  );
  expect(over).toBeLessThan(total * 0.1);
});

test('the first words of 13 point text with a 19.2 point line height match Chromium', async () => {
  const { over, total } = await differing(
    'raster-description',
    'chromium-inter-13-400-description-line1.png',
    480,
  );
  expect(over).toBeLessThan(total * 0.02);
});

test('a one-line title nested in a bordered, padded row matches Chromium', async () => {
  const { over, total } = await differing(
    'raster-nested-title',
    'chromium-inter-15-600-meeting-notes.png',
  );
  expect(over).toBeLessThan(total * 0.1);
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
