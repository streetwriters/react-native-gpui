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
  await app.setWindowSize(600, 1600);
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

test('a slot in a native parent of fixed height gets that height, and a ScrollView in it scrolls', async () => {
  const panel = await frameOf('slot-panel-root');
  await expect
    .poll(async () => (await frameOf('slot-scroll')).height, { timeout: 5000 })
    .toBe(80);
  const scroll = await frameOf('slot-scroll');
  expect(Math.round(scroll.y - panel.y)).toBe(20);
  const [node] = await app.query('testID', 'slot-scroll', true);
  await app.scroll(node.tag, 0, -60);
  await app.waitForIdle();
  const first = await frameOf('slot-row-3');
  expect(Math.round(first.y - scroll.y)).toBe(0);
  await pressCentre('slot-row-3');
  expect(await log()).toContain('row3,');
});

test('a slot taller than the height its native parent allows is clipped there', async () => {
  const image = PNG.sync.read(
    await app.getByTestId('slot-clip-root').screenshot(),
  );
  const scale = image.width / 240;
  const at = (y: number) => {
    const index =
      (Math.round(y * scale) * image.width + Math.round(10 * scale)) * 4;
    return image.data[index + 2] > 200 && image.data[index] < 60;
  };
  expect(at(30)).toBe(true);
  expect(at(70)).toBe(false);
});

test('keyboard: typing goes to the React Native input in a slot, and a key it does not handle reaches the native component that owns the slot', async () => {
  await app.getByTestId('slot-input').type('a');
  await desktopExpect(app.getByTestId('slot-typed')).toHaveText('typed:a');
  expect(await log()).not.toContain('owner:a');
  await app.getByTestId('slot-input').press('Backspace');
  expect(await log()).not.toContain('owner:backspace');
  await app.press('F2');
  await expect.poll(log, { timeout: 5000 }).toContain('owner:f2,');
});

test('input methods: composition, dead keys and the emoji picker reach the input in a slot and none of it reaches the native owner', async () => {
  const [input] = await app.query('testID', 'slot-input', true);
  await app.click(input.tag);
  const before = await log();
  await app.compose(input.tag, [
    { mark: 'に' },
    { mark: 'にほ' },
    { commit: '日本' },
    { mark: '´' },
    { commit: 'é' },
    { commit: '😀' },
  ]);
  await desktopExpect(app.getByTestId('slot-typed')).toHaveText(
    'typed:日本é😀',
  );
  expect(await log()).toBe(before);
});

test('focus: Tab moves from a native component into the slot and out of it', async () => {
  await pressCentre('slot-focus-before');
  await app.press('F3');
  await expect.poll(log, { timeout: 5000 }).toContain('before:f3,');
  await app.press('Tab');
  await app.press('F5');
  await expect.poll(log, { timeout: 5000 }).toContain('owner:f5,');
  await app.press('Tab');
  await app.press('F4');
  await expect.poll(log, { timeout: 5000 }).toContain('after:f4,');
  await app.press('shift-Tab');
  await app.press('F7');
  await expect.poll(log, { timeout: 5000 }).toContain('owner:f7,');
});

test('overlays: React Native content in a native popover takes presses while the popover is open, and a press outside dismisses it', async () => {
  const count = async () =>
    ((await log()).match(/popover-press,/g) ?? []).length;
  await app.waitForIdle();
  const popover = (await frameOf('slot-popover'))!;
  const top = (await app.menuBarState()).inset;
  const press = async (x: number, y: number) => {
    const at = { x, y: y + top };
    await app.mouseMove(at);
    await app.mouseDown(at);
    await app.mouseUp(at);
    await app.waitForIdle();
  };
  await press(popover.x + 10, popover.y + 5);
  await expect
    .poll(async () => (await frameOf('slot-popover-press'))?.width ?? 0, {
      timeout: 5000,
    })
    .toBeGreaterThan(0);
  await pressCentre('slot-popover-press');
  await expect.poll(count, { timeout: 5000 }).toBe(1);
  const outside = (await frameOf('slot-log'))!;
  await press(outside.x + 2, outside.y + 2);
  await expect.poll(log, { timeout: 5000 }).toContain('dismiss,');
  await pressCentre('slot-popover-press');
  expect(await count()).toBe(1);
});

test('overlays: a native tree in a React Native modal takes presses', async () => {
  await app.getByTestId('slot-modal-open').click();
  await expect
    .poll(async () => (await frameOf('slot-modal-box'))?.width ?? 0, {
      timeout: 5000,
    })
    .toBeGreaterThan(0);
  await pressCentre('slot-modal-box');
  await expect.poll(log, { timeout: 5000 }).toContain('modal-box,');
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
