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
      RN_GPUI_MODULE: 'RNGPUITester--stretch',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-stretch')).toBeVisible();
});

afterAll(() => app?.close());

async function width(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return node.frame.width;
}

test.each([
  'plain',
  'drag',
  'display',
  'hover',
  'dragover',
  'tooltip',
  'context',
  'group',
  'bg',
])('a row in %s wrappers takes the width of the column', async id => {
  const column = await width('stretch-column');
  const wrapper = await width(`${id}-wrapper`);
  expect(wrapper).toBe(column - 20);
  expect(await width(`${id}-item`)).toBe(wrapper);
  expect(await width(`${id}-inner`)).toBeGreaterThan(60);
  expect(await width(`${id}-title`)).toBeGreaterThan(60);
});

test('rows take the new width when the column grows', async () => {
  await app.getByTestId('stretch-widen').click();
  await app.waitForIdle();
  const column = await width('stretch-column');
  expect(column).toBe(300);
  for (const id of ['plain', 'drag', 'display']) {
    expect(await width(`${id}-item`)).toBe(column - 20);
    expect(await width(`${id}-title`)).toBeGreaterThan(60);
  }
});
