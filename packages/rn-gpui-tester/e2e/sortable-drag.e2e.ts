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
      RN_GPUI_MODULE: 'RNGPUITester--sortable-drag',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('sortable-order')).toBeVisible();
});

afterAll(() => app?.close());

async function tag(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return node.tag as number;
}

const order = async () =>
  (await app.query('testID', 'sortable-order', true))[0].text;

test('app.drag between two draggable and droppable siblings reorders them through the payload set in onDragStart', async () => {
  expect(await order()).toBe('one,two,three');
  await app.drag(await tag('sortable-three'), await tag('sortable-one'), {
    steps: 12,
    duration: 600,
  });
  await app.waitForIdle();
  expect(await order()).toBe('three,one,two');
  await app.drag(await tag('sortable-three'), await tag('sortable-two'), {
    steps: 4,
  });
  await app.waitForIdle();
  expect(await order()).toBe('one,two,three');
});

test('a value returned from onDragStart is not the payload: only DragDrop.setPayload is', async () => {
  await app.drag(await tag('sortable-returns'), await tag('sortable-returns'), {
    steps: 4,
  });
  await app.drag(await tag('sortable-one'), await tag('sortable-returns'), {
    steps: 4,
  });
  await app.waitForIdle();
  const [returned] = await app.query('testID', 'sortable-returned', true);
  expect(returned.text).toBe('{"id":"one"}');
});
