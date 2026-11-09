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
      RN_GPUI_MODULE: 'RNGPUITester--pointer-capture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-pointer-capture'),
  ).toBeVisible();
});

afterAll(() => app?.close());

const log = () => app.getByTestId('capture-log').textContent();

test('moves and the release reach the pressed view and its ancestors outside it', async () => {
  const [target] = await app.query('testID', 'capture-target', true);
  const top = (await app.menuBarState()).inset;
  const y = target.frame.y + 25 + top;
  const inside = { x: target.frame.x + 50, y };
  const outside = { x: target.frame.x + 400, y };
  const other = await app.query('testID', 'capture-other', true);
  expect(other.length).toBe(1);

  await app.mouseDown(inside);
  await app.mouseMove({ x: inside.x + 20, y });
  await app.mouseMove(outside);
  await app.mouseMove({ x: outside.x + 30, y });
  await app.mouseUp({ x: outside.x + 30, y });
  await app.waitForIdle();

  const text = await log();
  expect(text.startsWith(`down@${Math.round(inside.x)}`)).toBe(true);
  expect(text).toContain(`move@${Math.round(outside.x)}`);
  expect(text).toContain(`move@${Math.round(outside.x + 30)}`);
  expect(text.endsWith(`up@${Math.round(outside.x + 30)}`)).toBe(true);
  const parent = await app.getByTestId('capture-parent-moves').textContent();
  expect(Number(parent.replace('parent moves ', ''))).toBeGreaterThanOrEqual(3);
});

test('a view the pointer passes over while pressed elsewhere gets no moves', async () => {
  const [target] = await app.query('testID', 'capture-target', true);
  const [other] = await app.query('testID', 'capture-other', true);
  const top = (await app.menuBarState()).inset;
  const before = await log();
  await app.mouseDown({ x: target.frame.x + 50, y: target.frame.y + 25 + top });
  await app.mouseMove({
    x: other.frame.x + 50,
    y: other.frame.y + 25 + top,
  });
  await app.mouseUp({ x: other.frame.x + 50, y: other.frame.y + 25 + top });
  await app.waitForIdle();
  expect((await log()).slice(before.length)).not.toContain('other-move');
});

test('a release outside the window reaches the pressed view and ends the gesture', async () => {
  const [target] = await app.query('testID', 'capture-target', true);
  const top = (await app.menuBarState()).inset;
  const y = target.frame.y + 25 + top;
  const before = await log();
  await app.mouseDown({ x: target.frame.x + 50, y });
  await app.mouseMove({ x: target.frame.x + 80, y });
  await app.mouseMove({ x: 5000, y });
  await app.mouseUp({ x: 5000, y });
  await app.waitForIdle();
  const added = (await log()).slice(before.length);
  expect(added).toContain('move@5000');
  expect(added.endsWith('up@5000')).toBe(true);
});
