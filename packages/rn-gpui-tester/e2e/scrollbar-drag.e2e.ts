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
      RN_GPUI_MODULE: 'RNGPUITester--scrollbar-drag',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-scrollbar-drag'),
  ).toBeVisible();
});

afterAll(() => app?.close());

type TreeNode = {
  testID?: string;
  scrollOffset?: [number, number];
  children?: TreeNode[];
};

async function offsetOf(testID: string) {
  const find = (node: TreeNode): TreeNode | undefined =>
    node.testID === testID ? node : node.children?.map(find).find(Boolean);
  const tree = (await app.tree()) as TreeNode;
  return find(tree)?.scrollOffset?.[1] ?? 0;
}

async function dragThumb(testID: string) {
  const [view] = await app.query('testID', testID, true);
  const top = (await app.menuBarState()).inset;
  const x = view.frame.x + view.frame.width - 5;
  const y = view.frame.y + top + 12;
  await app.mouseMove({ x, y });
  await app.waitForIdle();
  await app.mouseDown({ x, y });
  for (const step of [20, 40, 60, 80]) {
    await app.mouseMove({ x, y: y + step });
  }
  await app.mouseUp({ x, y: y + 80 });
  await app.waitForIdle();
}

test('a nested scroll view takes the drag of its own thumb', async () => {
  const outer = await offsetOf('drag-outer');
  await dragThumb('drag-inner');
  expect(await offsetOf('drag-inner')).toBeGreaterThan(0);
  expect(await offsetOf('drag-outer')).toBe(outer);
});

test.each(['drag-plain', 'drag-flat', 'drag-faded', 'drag-outer'])(
  'dragging the thumb of %s moves its offset and raises no error',
  async testID => {
    expect(await offsetOf(testID)).toBe(0);
    await dragThumb(testID);
    expect(await offsetOf(testID)).toBeGreaterThan(50);
  },
);

test.each(['drag-plain', 'drag-faded'])(
  'a press on the track of %s moves a page towards the pointer',
  async testID => {
    const [view] = await app.query('testID', testID, true);
    const top = (await app.menuBarState()).inset;
    const x = view.frame.x + view.frame.width - 5;
    const y = view.frame.y + top + view.frame.height - 12;
    const before = await offsetOf(testID);
    await app.mouseMove({ x, y });
    await app.waitForIdle();
    await app.mouseDown({ x, y });
    await app.mouseUp({ x, y });
    await app.waitForIdle();
    expect(await offsetOf(testID)).toBeCloseTo(before + 240 * 0.875, 0);
  },
);

test('the handlers run in order with the offset', async () => {
  const log = (await app.getByTestId('bar-log').textContent()).split(' ');
  expect(log[0]).toMatch(/^start:\d+$/);
  expect(log[log.length - 1]).toMatch(/^end:\d+$/);
  expect(log.filter(entry => entry.startsWith('start'))).toHaveLength(1);
  expect(log.filter(entry => entry.startsWith('end'))).toHaveLength(1);
  const offsets = log.map(entry => Number(entry.split(':')[1]));
  expect(offsets[offsets.length - 1]).toBeGreaterThan(50);
  expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
});
