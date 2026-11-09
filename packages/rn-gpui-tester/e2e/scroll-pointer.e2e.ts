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

async function point() {
  const [target] = await app.query('testID', 'scroll-pointer-target', true);
  const top = (await app.menuBarState()).inset;
  return { x: target.frame.x + 40, y: target.frame.y + 30 + top };
}

test('a move with nothing held reports buttons 0', async () => {
  const { x, y } = await point();
  const before = (await log()).length;
  await app.mouseMove({ x, y });
  await app.mouseMove({ x: x + 10, y });
  await app.waitForIdle();
  const moves = (await log())
    .slice(before)
    .filter(entry => entry.startsWith('move:'));
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every(entry => entry.endsWith(':0'))).toBe(true);
});

test('a right-button drag reports buttons 2 on the press and the moves, and 0 on the release', async () => {
  const { x, y } = await point();
  const before = (await log()).length;
  await app.mouseDown({ x, y }, { button: 'right' });
  await app.mouseMove({ x: x + 30, y: y + 5 });
  await app.mouseMove({ x: x + 80, y: y + 10 });
  await app.mouseUp({ x: x + 80, y: y + 10 }, { button: 'right' });
  await app.waitForIdle();
  const entries = (await log()).slice(before);
  expect(entries[0]).toMatch(/^down:.*:2$/u);
  const moves = entries.filter(entry => entry.startsWith('move:'));
  expect(moves.length).toBe(2);
  expect(moves.every(entry => entry.endsWith(':2'))).toBe(true);
  expect(entries[entries.length - 1]).toMatch(/^up:.*:0$/u);
});

test('with two buttons held the mask is combined and shrinks as each is released', async () => {
  const { x, y } = await point();
  const before = (await log()).length;
  await app.mouseDown({ x, y });
  await app.mouseDown({ x, y }, { button: 'right' });
  await app.mouseMove({ x: x + 30, y });
  await app.mouseUp({ x: x + 30, y }, { button: 'right' });
  await app.mouseMove({ x: x + 50, y });
  await app.mouseUp({ x: x + 50, y });
  await app.waitForIdle();
  const entries = (await log()).slice(before);
  expect(
    entries.map(entry => `${entry.split(':')[0]}:${entry.split(':')[2]}`),
  ).toEqual(['down:1', 'down:3', 'move:3', 'up:1', 'move:1', 'up:0']);
});
