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
      RN_GPUI_MODULE: 'RNGPUITester--key-events',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-key-events'),
  ).toBeVisible();
});

afterAll(() => app?.close());

test('a key press reaches the focused view once and bubbles to its ancestors', async () => {
  const [grandchild] = await app.query('testID', 'keys-grandchild', true);
  await app.focus(grandchild.tag);
  await app.waitForIdle();
  await app.press('ArrowDown');
  await app.waitForIdle();
  await app.press('down');
  await app.press('Escape');
  await app.press('shift-ArrowUp');
  await app.waitForIdle();
  expect(await app.getByTestId('keys-log').textContent()).toBe(
    'ArrowDown,ArrowDown,Escape,ArrowUp',
  );
});

test('a press event carries the modifier keys', async () => {
  await app.getByTestId('press-target').click();
  await app.waitForIdle();
  expect(await app.getByTestId('press-log').textContent()).toBe(
    'shift=false ctrl=false alt=false meta=false',
  );
  await app
    .getByTestId('press-target')
    .click({ modifiers: { shift: true, platform: true } });
  await app.waitForIdle();
  expect(await app.getByTestId('press-log').textContent()).toBe(
    'shift=true ctrl=false alt=false meta=true',
  );
});
