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
      RN_GPUI_MODULE: 'RNGPUITester--hover-rows',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('hover-rows-scroll')).toBeVisible();
});

afterAll(() => app?.close());

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function afterGesture(tag: number) {
  await app.scroll(tag, 0, -20);
  await app.waitForIdle();
  await sleep(300);
  await app.waitForIdle();
  await app.scroll(tag, 0, -20, 10, 'moved', 5);
  await app.layoutStats({ reset: true });
  await sleep(400);
  await app.waitForIdle();
  return app.layoutStats({ reset: true });
}

const hoveredRows = async (prefix: string) => {
  const rows = await app.query('testID', prefix, false);
  const hovered: string[] = [];
  for (const row of rows) {
    if ((await app.getProps(row.tag)).states?.includes('hover')) {
      hovered.push(row.testID as string);
    }
  }
  return hovered;
};

test('the end of a wheel gesture over a row builds the row for its hover and not the whole tree', async () => {
  const [row] = await app.query('testID', 'hover-static-4', true);
  const stats = await afterGesture(row.tag);
  expect(stats.viewsBuilt).toBeLessThan(40);
  expect(await hoveredRows('hover-static-')).toEqual(['hover-static-4']);
});

test('the end of a wheel gesture over empty space builds nothing', async () => {
  const [empty] = await app.query('testID', 'hover-rows-empty', true);
  const stats = await afterGesture(empty.tag);
  expect(stats.viewsBuilt).toBeLessThan(10);
});
