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
      RN_GPUI_MODULE: 'RNGPUITester--input-line-height',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('line-text-15')).toBeVisible();
});

afterAll(() => app?.close());

async function height(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return node.frame.height;
}

test.each([13, 15, 16, 20])(
  'a %ipx single-line input is as tall as a line of text',
  async size => {
    const text = await height(`line-text-${size}`);
    expect(await height(`line-input-${size}`)).toBe(text);
    expect(await height(`line-placeholder-${size}`)).toBe(text);
    expect(await height(`line-empty-${size}`)).toBe(text);
  },
);

test.each([13, 15, 16, 20])(
  'an explicit lineHeight sets a %ipx single-line input height',
  async size => {
    expect(await height(`line-explicit-${size}`)).toBe(size * 2);
  },
);
