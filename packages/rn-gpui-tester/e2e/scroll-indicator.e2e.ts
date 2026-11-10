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
      RN_GPUI_MODULE: 'RNGPUITester--scroll-indicator',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_SCROLLER_STYLE: 'overlay',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('indicator-scroll')).toBeVisible();
});

afterAll(() => app?.close());

type TreeNode = {
  testID?: string;
  scrollOffset?: [number, number];
  scrollIndicatorShown?: boolean;
  children?: TreeNode[];
};

async function scrollNode() {
  const find = (node: TreeNode): TreeNode | undefined =>
    node.testID === 'indicator-scroll'
      ? node
      : node.children?.map(find).find(Boolean);
  return find((await app.tree()) as TreeNode)!;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function press() {
  const [key] = await app.query('testID', 'indicator-key', true);
  await app.focus(key.tag);
  await app.press('a');
  await app.waitForIdle();
}

test('the thumb is hidden at rest, shown by a user scroll, and hides again', async () => {
  expect((await scrollNode()).scrollIndicatorShown).toBe(false);
  const [scroll] = await app.query('testID', 'indicator-scroll', true);
  await app.scroll(scroll.tag, 0, -60);
  await app.waitForIdle();
  expect((await scrollNode()).scrollIndicatorShown).toBe(true);
  await sleep(700);
  await app.waitForIdle();
  expect((await scrollNode()).scrollIndicatorShown).toBe(false);
});

test('a scrollTo from the app moves the content without showing the thumb', async () => {
  await press();
  const node = await scrollNode();
  expect(node.scrollOffset![1]).toBe(300);
  expect(node.scrollIndicatorShown).toBe(false);
  await press();
  await sleep(300);
  expect((await scrollNode()).scrollIndicatorShown).toBe(false);
});

test('flashScrollIndicators shows the thumb for its delay', async () => {
  await press();
  expect((await scrollNode()).scrollIndicatorShown).toBe(true);
  await sleep(700);
  await app.waitForIdle();
  expect((await scrollNode()).scrollIndicatorShown).toBe(false);
});
