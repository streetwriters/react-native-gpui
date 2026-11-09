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
      RN_GPUI_MODULE: 'RNGPUITester--scroll-pointer',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('scroll-pointer-target')).toBeVisible();
});

afterAll(() => app?.close());

const log = async () =>
  (await app.getByTestId('scroll-pointer-log').textContent())
    .split(' ')
    .filter(Boolean);

async function drag(scrolled: boolean) {
  const [target] = await app.query('testID', 'scroll-pointer-target', true);
  const top = (await app.menuBarState()).inset;
  const x = target.frame.x + 40;
  const y = target.frame.y + 30 + top;
  const before = (await log()).length;
  await app.mouseDown({ x, y });
  await app.mouseMove({ x: x + 20, y: y + 5 });
  await app.mouseMove({ x: x + 60, y: y + 10 });
  await app.mouseMove({ x: x + 120, y: y + 20 });
  await app.mouseUp({ x: x + 120, y: y + 20 });
  await app.waitForIdle();
  return { entries: (await log()).slice(before), scrolled };
}

test('a drag inside a ScrollView delivers the moves with the button held to the child, in order', async () => {
  const { entries } = await drag(false);
  expect(entries[0].startsWith('down:40,30')).toBe(true);
  const moves = entries.filter(entry => entry.startsWith('move:'));
  expect(moves.map(entry => entry.split(':')[1])).toEqual([
    '60,35',
    '100,40',
    '160,50',
  ]);
  expect(moves.every(entry => entry.endsWith(':1'))).toBe(true);
  expect(entries[entries.length - 1].startsWith('up:160,50')).toBe(true);
});

test('the same drag works after the ScrollView has scrolled', async () => {
  const [scroll] = await app.query('testID', 'scroll-pointer-scroll', true);
  await app.scroll(scroll.tag, 0, -30);
  await app.waitForIdle();
  const { entries } = await drag(true);
  expect(entries.filter(entry => entry.startsWith('move:')).length).toBe(3);
  expect(entries[0].startsWith('down:')).toBe(true);
});

test('a drag that leaves the ScrollView keeps reaching the child', async () => {
  const [target] = await app.query('testID', 'scroll-pointer-target', true);
  const top = (await app.menuBarState()).inset;
  const x = target.frame.x + 40;
  const y = target.frame.y + 30 + top;
  const before = (await log()).length;
  await app.mouseDown({ x, y });
  await app.mouseMove({ x: x + 500, y });
  await app.mouseMove({ x: x + 600, y: y + 200 });
  await app.mouseUp({ x: x + 600, y: y + 200 });
  await app.waitForIdle();
  const entries = (await log()).slice(before);
  expect(entries.filter(entry => entry.startsWith('move:')).length).toBe(2);
  expect(entries[entries.length - 1].startsWith('up:')).toBe(true);
});
