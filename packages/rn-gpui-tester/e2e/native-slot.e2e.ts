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
      RN_GPUI_MODULE: 'NativeSlotFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 700);
  await desktopExpect(app.getByTestId('slot-content')).toBeVisible();
});

afterAll(() => app?.close());

const log = async () => (await app.getByTestId('slot-log').textContent()) ?? '';

const frameOf = async (testID: string) =>
  (await app.query('testID', testID, true))[0].frame;

async function pressCentre(testID: string) {
  const frame = await frameOf(testID);
  const top = (await app.menuBarState()).inset;
  const at = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2 + top,
  };
  await app.mouseMove(at);
  await app.mouseDown(at);
  await app.mouseUp(at);
  await app.waitForIdle();
}

test('layout: the content takes the width of the native layout and pushes what follows it down', async () => {
  const root = await frameOf('slot-root');
  await expect
    .poll(async () => (await frameOf('slot-content')).width, { timeout: 5000 })
    .toBe(240);
  const above = await frameOf('slot-above');
  const content = await frameOf('slot-content');
  const below = await frameOf('slot-below');
  expect(Math.round(content.y)).toBe(Math.round(above.y + above.height));
  await expect
    .poll(
      async () => {
        const [c, b] = [
          await frameOf('slot-content'),
          await frameOf('slot-below'),
        ];
        return Math.round(b.y - (c.y + c.height));
      },
      { timeout: 5000 },
    )
    .toBe(0);
  expect(below.y).toBeGreaterThan(root.y);
});

test('painting: the content is painted where the slot is', async () => {
  const image = PNG.sync.read(await app.getByTestId('slot-root').screenshot());
  const scale = image.width / 240;
  const content = await frameOf('slot-content');
  const root = await frameOf('slot-root');
  const at = (x: number, y: number) => {
    const index =
      (Math.round(y * scale) * image.width + Math.round(x * scale)) * 4;
    return [image.data[index], image.data[index + 1], image.data[index + 2]];
  };
  const [r, g, b] = at(2, content.y - root.y + 2);
  expect(b).toBeGreaterThan(200);
  expect(r).toBeLessThan(60);
  expect(g).toBeLessThan(60);
});

test('context: the content sees the contexts of the native tree', async () => {
  await desktopExpect(app.getByTestId('slot-context')).toHaveText(
    'context:native',
  );
});

test('hit testing: a press reaches the React Native content, and the native components around it', async () => {
  await pressCentre('slot-press');
  expect(await log()).toContain('press,');
  await pressCentre('slot-above');
  expect(await log()).toContain('above,');
  await pressCentre('slot-below');
  expect(await log()).toContain('below,');
});

test('layout: content that grows pushes the native components after it further down', async () => {
  const before = await frameOf('slot-below');
  await app.getByTestId('slot-grow').click();
  await expect
    .poll(async () => (await frameOf('slot-below')).y, { timeout: 5000 })
    .toBeGreaterThan(before.y);
  await pressCentre('slot-below');
  expect(await log()).toMatch(/below,.*below,/);
});

test('native inside React Native inside native: the innermost component takes a press', async () => {
  await pressCentre('slot-inner');
  expect(await log()).toContain('inner,');
});

test('removing the slot removes its content and the native components after it move up', async () => {
  const before = await frameOf('slot-below');
  await app.getByTestId('slot-toggle').click();
  await expect
    .poll(async () => (await app.query('testID', 'slot-content', true)).length)
    .toBe(0);
  await expect
    .poll(async () => (await frameOf('slot-below')).y, { timeout: 5000 })
    .toBeLessThan(before.y);
});

test('measures: what a native commit costs with a thousand React Native views in a slot', async () => {
  await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NativeSlotLoadFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    initialProps: { count: 1000 },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('slot-load-root')).toBeVisible();
  await app.hostCounters({ reset: true });
  for (let step = 0; step < 5; step++) {
    await app.getByTestId('slot-load-tick').click();
    await app.waitForIdle();
  }
  const counters = await app.hostCounters();
  console.log(
    `native render ${(counters.nativeRenderMicros / 5 / 1000).toFixed(2)} ms per commit`,
  );
});
