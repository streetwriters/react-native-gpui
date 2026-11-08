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
    const shift = Math.round((rows.frame.y - 192.5) * scale);
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

test('a text box with an explicit line height is as tall as Chromium snaps its lines', async () => {
  const height = async (id: string) =>
    (await app.query('testID', id, true))[0].frame.height;
  expect(await height('row-body-0')).toBe(38.5);
  expect(await height('row-body-2')).toBe(57.5);
  expect(await height('row-body-3')).toBe(38.5);
});

test('a nested Text with a backgroundColor is painted behind its words', async () => {
  const mine = PNG.sync.read(await app.screenshot());
  const scale = mine.width / 1024;
  const [outer] = await app.query('testID', 'highlight', true);
  const pixel = (x: number, y: number) => {
    const o = (Math.round(y * scale) * mine.width + Math.round(x * scale)) * 4;
    return [mine.data[o], mine.data[o + 1], mine.data[o + 2]];
  };
  const y = outer.frame.y + outer.frame.height / 2;
  const red: number[] = [];
  for (let x = outer.frame.x; x < outer.frame.x + outer.frame.width; x += 0.5) {
    const [r, g, b] = pixel(x, y);
    if (r > 200 && g < 60 && b < 60) red.push(x);
  }
  expect(red.length).toBeGreaterThan(20);
  const left = Math.min(...red);
  const right = Math.max(...red);
  expect(left).toBeGreaterThan(outer.frame.x + 20);
  expect(right).toBeLessThan(outer.frame.x + outer.frame.width - 20);
  const column = left + 0.5;
  let top = Infinity;
  let bottom = -Infinity;
  for (let offset = -4; offset < outer.frame.height + 4; offset += 0.5) {
    const [r, g, b] = pixel(column, outer.frame.y + offset);
    if (r > 200 && g < 60 && b < 60) {
      top = Math.min(top, offset);
      bottom = Math.max(bottom, offset);
    }
  }
  const tall = bottom - top + 0.5;
  expect(tall).toBeGreaterThanOrEqual(14);
  expect(tall).toBeLessThanOrEqual(outer.frame.height);
});
