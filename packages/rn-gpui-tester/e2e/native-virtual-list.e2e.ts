import path from 'node:path';
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
      RN_GPUI_MODULE: 'NativeVirtualListFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('vlist-root')).toBeVisible();
});

afterAll(() => app?.close());

const has = async (testID: string) =>
  (await app.query('testID', testID, true)).length > 0;

const created = async () => {
  await app.getByTestId('vlist-read').click();
  await app.waitForIdle();
  return Number(
    ((await app.getByTestId('vlist-created').textContent()) ?? '').split(
      ':',
    )[1],
  );
};

test('only the items in view and a little more exist', async () => {
  await expect.poll(() => has('vrow-0'), { timeout: 5000 }).toBe(true);
  expect(await has('vrow-9')).toBe(true);
  expect(await has('vrow-200')).toBe(false);
});

test('scrolling brings the items in view and drops the others, without creating more than the window needs', async () => {
  const before = await created();
  const [list] = await app.query('testID', 'vlist-root', true);
  for (let step = 0; step < 20; step++) {
    await app.scroll(list.tag, 0, -100);
  }
  await app.waitForIdle();
  await expect.poll(() => has('vrow-100'), { timeout: 5000 }).toBe(true);
  expect(await has('vrow-0')).toBe(false);
  const after = await created();
  expect(after - before).toBeLessThanOrEqual(10);
});

test('a press on an item after scrolling reaches that item, and an item may hold a slot', async () => {
  const [node] = await app.query('testID', 'vrow-100', true);
  const top = (await app.menuBarState()).inset;
  const at = {
    x: node.frame.x + node.frame.width / 2,
    y: node.frame.y + node.frame.height / 2 + top,
  };
  await app.mouseMove(at);
  await app.mouseDown(at);
  await app.mouseUp(at);
  await app.waitForIdle();
  await expect
    .poll(async () => (await app.getByTestId('vlist-log').textContent()) ?? '')
    .toContain('100,');
});

test('an item with React Native content in a slot scrolls with the list', async () => {
  const [list] = await app.query('testID', 'vlist-root', true);
  await app.scroll(list.tag, 0, 4000);
  await app.waitForIdle();
  await app.scroll(list.tag, 0, -(57 * 20 - 40));
  await app.waitForIdle();
  await expect.poll(() => has('vslot-57'), { timeout: 5000 }).toBe(true);
});
