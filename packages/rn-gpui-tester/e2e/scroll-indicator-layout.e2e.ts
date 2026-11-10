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
  component?: string;
  frame?: [number, number, number, number];
  children?: TreeNode[];
};

async function widths() {
  const find = (node: TreeNode): TreeNode | undefined =>
    node.testID === 'indicator-scroll'
      ? node
      : node.children?.map(find).find(Boolean);
  const scroll = find((await app.tree()) as TreeNode)!;
  const content = scroll.children![0];
  return { scroll: scroll.frame![2], content: content.frame![2] };
}

test('legacy scrollers take their width from the content, and the layout follows the style as it changes', async () => {
  const overlay = await widths();
  expect(overlay.content).toBe(overlay.scroll);
  await app.setScrollerStyle('legacy');
  await app.waitForIdle();
  const legacy = await widths();
  expect(legacy.scroll).toBe(overlay.scroll);
  expect(legacy.content).toBe(overlay.scroll - 12);
  await app.setScrollerStyle('overlay');
  await app.waitForIdle();
  expect((await widths()).content).toBe(overlay.scroll);
});
