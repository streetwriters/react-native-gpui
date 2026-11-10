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
      RN_GPUI_MODULE: 'RNGPUITester--menu-under-pointer',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('menu-host')).toBeVisible();
});

afterAll(() => app?.close());

async function closeMenu() {
  const [close] = await app.query('testID', 'menu-close', true);
  await app.focus(close.tag);
  await app.press('a');
  await app.waitForIdle();
}

const states = async (testID: string) => {
  const [node] = await app.query('testID', testID, true);
  return (await app.getProps(node.tag)).states;
};

test('a Pressable that mounts under the pointer after a right click reports onHoverIn', async () => {
  await closeMenu();
  await app.getByTestId('menu-host').rightClick();
  await app.waitForIdle();
  expect((await app.query('testID', 'menu-hovered', true))[0].text).toBe('in');
});

test('an item that mounts under the pointer after a right click is hovered without a pointer move', async () => {
  await closeMenu();
  await app.getByTestId('menu-host').rightClick();
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('menu-item-last')).toBeVisible();
  expect(await states('menu-item-last')).toEqual(['hover']);
  expect(await states('menu-item-first')).toEqual([]);
});

test('an item that mounts under the pointer after a key press is hovered too', async () => {
  await closeMenu();
  const [host] = await app.query('testID', 'menu-host', true);
  const top = (await app.menuBarState()).inset;
  await app.mouseMove({ x: host.frame.x + 20, y: host.frame.y + 20 + top });
  await app.waitForIdle();
  await app.mouseMove({ x: host.frame.x + 300, y: host.frame.y + 300 + top });
  await app.waitForIdle();
  await app.focus(host.tag);
  await app.press('a');
  await app.waitForIdle();
  expect(await states('menu-item-last')).toEqual(['hover']);
});
