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
      RN_GPUI_MODULE: 'RNGPUITester--text-rows',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 900);
  await desktopExpect(app.getByTestId('tester-screen-text-rows')).toBeVisible();
});

afterAll(() => app?.close());

const golden = JSON.parse(
  fs.readFileSync(
    path.resolve('packages/rn-gpui-tester/e2e/golden/chromium-rows.json'),
    'utf8',
  ),
) as { x: number; y: number; width: number; height: number; name: string }[];
const reference = PNG.sync.read(
  fs.readFileSync(
    path.resolve('packages/rn-gpui-tester/e2e/golden/chromium-rows.png'),
  ),
);

test.fails(
  'text in rows at fractional heights lands on the pixels Chromium picks',
  async () => {
    const [rows] = await app.query('testID', 'rows', true);
    const mine = PNG.sync.read(await app.screenshot());
    if (process.env.RASTER_DUMP) {
      fs.writeFileSync(
        path.resolve('.local/text/mine-rows.png'),
        PNG.sync.write(mine),
      );
      fs.writeFileSync(
        path.resolve('.local/text/mine-rows-y.txt'),
        String(rows.frame.y),
      );
    }
    const scale = mine.width / 1024;
    const shift = Math.round((rows.frame.y - 193) * scale);
    const shares: Record<string, number> = {};
    for (const rect of golden) {
      const x0 = Math.floor(rect.x * scale) - 2;
      const y0 = Math.floor(rect.y * scale) - 3;
      const w = Math.ceil(rect.width * scale) + 6;
      const h = Math.ceil(rect.height * scale) + 6;
      let over = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const a = reference.data[((y0 + y) * reference.width + x0 + x) * 4];
          const b = mine.data[((y0 + y + shift) * mine.width + x0 + x) * 4];
          if (Math.abs(a - b) > 25) over += 1;
        }
      }
      shares[rect.name] = over / (w * h);
    }
    for (const share of Object.values(shares)) expect(share).toBeLessThan(0.01);
  },
);
