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
      RN_GPUI_MODULE: 'RNGPUITester--flex-basis',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-flex-basis'),
  ).toBeVisible();
});

afterAll(() => app?.close());

async function frames(id: string) {
  const width = async (name: string) => {
    const [node] = await app.query('testID', `${id}-${name}`, true);
    return node.frame.width;
  };
  return {
    item: await width('item'),
    inner: await width('inner'),
    title: await width('title'),
  };
}

test.each(['auto'])(
  'a flex-basis of %s sizes a row item to its content, as CSS does',
  async id => {
    const { item, title } = await frames(id);
    expect(title).toBeGreaterThan(100);
    expect(item).toBeGreaterThan(title);
  },
);

test.each(['flex', 'points', 'percent'])(
  'a flex-basis of %s collapses a row item in a content-sized row',
  async id => {
    const { title, inner } = await frames(id);
    expect(title).toBeLessThan(20);
    expect(inner).toBe(0);
  },
);
