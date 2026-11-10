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
      RN_GPUI_MODULE: 'RNGPUITester--scroll-reserve',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_SCROLLER_STYLE: 'legacy',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('reserve-custom')).toBeVisible();
});

afterAll(() => app?.close());

type TreeNode = {
  testID?: string;
  frame?: [number, number, number, number];
  children?: TreeNode[];
};

function find(node: TreeNode, id: string): TreeNode | undefined {
  return node.testID === id
    ? node
    : node.children?.map(child => find(child, id)).find(Boolean);
}

async function frames(id: string) {
  const scroll = find((await app.tree()) as TreeNode, id)!;
  return { scroll, content: scroll.children![0] };
}

test('a ScrollBar with its own thickness reserves that thickness', async () => {
  const { scroll, content } = await frames('reserve-custom');
  expect(content.frame![2]).toBe(scroll.frame![2] - 20);
});

test('a virtualised list reserves the scroller width and keeps its rows inside it', async () => {
  const { scroll, content } = await frames('reserve-list');
  expect(content.frame![2]).toBe(scroll.frame![2] - 12);
  const row = find(scroll, 'reserve-row-0')!;
  expect(row.frame![2]).toBe(scroll.frame![2] - 12);
});

test('a nested scroll view reserves its own scroller inside the outer one', async () => {
  const outer = await frames('reserve-outer');
  expect(outer.content.frame![2]).toBe(outer.scroll.frame![2] - 12);
  const inner = await frames('reserve-inner');
  expect(inner.scroll.frame![2]).toBe(outer.content.frame![2]);
  expect(inner.content.frame![2]).toBe(inner.scroll.frame![2] - 12);
});
