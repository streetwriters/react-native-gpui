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
      RN_GPUI_SCROLLER_STYLE: 'legacy',
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
  scrollIndicatorShown?: boolean;
  frame?: [number, number, number, number];
  children?: TreeNode[];
};

test('with legacy scrollers the thumb is always shown at rest', async () => {
  const find = (node: TreeNode): TreeNode | undefined =>
    node.testID === 'indicator-scroll'
      ? node
      : node.children?.map(find).find(Boolean);
  const node = find((await app.tree()) as TreeNode)!;
  expect(node.scrollIndicatorShown).toBe(true);
});

test('with legacy scrollers the content is narrower than the scroll view by the scroller width from the start', async () => {
  const find = (node: TreeNode): TreeNode | undefined =>
    node.testID === 'indicator-scroll'
      ? node
      : node.children?.map(find).find(Boolean);
  const scroll = find((await app.tree()) as TreeNode)!;
  expect(scroll.children![0].frame![2]).toBe(scroll.frame![2] - 12);
});
