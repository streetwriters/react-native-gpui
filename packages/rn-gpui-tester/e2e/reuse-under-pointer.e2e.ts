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
      RN_GPUI_MODULE: 'RNGPUITester--reuse-under-pointer',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('reuse-count')).toBeVisible();
});

afterAll(() => app?.close());

test('a React commit that changes one leaf does not rebuild the tree while the pointer is inside the window', async () => {
  const [row] = await app.query('testID', 'reuse-row-30', true);
  const top = (await app.menuBarState()).inset;
  await app.mouseMove({ x: row.frame.x + 10, y: row.frame.y + 3 + top });
  const [key] = await app.query('testID', 'reuse-key', true);
  await app.focus(key.tag);
  await app.press('a');
  await app.waitForIdle();
  await app.layoutStats({ reset: true });
  for (let step = 0; step < 5; step++) {
    await app.press('a');
    await app.waitForIdle();
  }
  const stats = await app.layoutStats({ reset: true });
  expect(await app.getByTestId('reuse-count').textContent()).toBe('6');
  expect(stats.layoutNodes).toBeGreaterThan(120);
  expect(stats.viewsBuilt / 5).toBeLessThan(40);
});

test('after a key the view painted over the pointer keeps the hover, not the one under it', async () => {
  const [overlay] = await app.query('testID', 'overlay-above', true);
  const [row] = await app.query('testID', 'overlay-row-inner', true);
  const top = (await app.menuBarState()).inset;
  await app.mouseMove({
    x: overlay.frame.x + 30,
    y: overlay.frame.y + 20 + top,
  });
  await app.waitForIdle();
  const states = async (tag: number) => (await app.getProps(tag)).states;
  expect(await states(overlay.tag)).toEqual(['hover']);
  expect(await states(row.tag)).toEqual([]);
  const [key] = await app.query('testID', 'reuse-key', true);
  await app.focus(key.tag);
  await app.press('a');
  await app.press('a');
  await app.waitForIdle();
  expect(await states(overlay.tag)).toEqual(['hover']);
  expect(await states(row.tag)).toEqual([]);
});

test('layoutStats reports the target lookups of the keyboard hover pass', async () => {
  await app.layoutStats({ reset: true });
  await app.press('a');
  await app.waitForIdle();
  const stats = await app.layoutStats({ reset: true });
  expect(stats.targetAtCalls).toBeGreaterThan(0);
  expect(stats.targetAtMs).toBeGreaterThanOrEqual(0);
  expect(stats.targetAtMs / stats.targetAtCalls).toBeLessThan(5);
});

test('typing into a field with the pointer inside the window keeps the views that did not change', async () => {
  const [row] = await app.query('testID', 'reuse-row-30', true);
  const top = (await app.menuBarState()).inset;
  await app.mouseMove({ x: row.frame.x + 10, y: row.frame.y + 3 + top });
  const [input] = await app.query('testID', 'reuse-input', true);
  await app.typeText(input.tag, 'a');
  await app.waitForIdle();
  const built: number[] = [];
  for (const char of 'pple') {
    await app.layoutStats({ reset: true });
    await app.typeText(input.tag, char);
    await app.waitForIdle();
    built.push((await app.layoutStats({ reset: true })).viewsBuilt);
  }
  const [typed] = await app.query('testID', 'reuse-input', true);
  expect(typed.text).toBe('apple');
  expect(Math.max(...built.slice(0, 3))).toBeLessThan(400);
});
