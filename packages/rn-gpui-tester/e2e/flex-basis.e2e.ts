import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp | undefined;

async function start(strict: boolean) {
  await app?.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: strict
        ? 'RNGPUITester--flex-basis-strict'
        : 'RNGPUITester--flex-basis',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId(
      strict ? 'tester-screen-flex-basis-strict' : 'tester-screen-flex-basis',
    ),
  ).toBeVisible();
}

afterAll(() => app?.close());

async function frames(id: string) {
  const width = async (name: string) => {
    const [node] = await app!.query('testID', `${id}-${name}`, true);
    return node.frame.width;
  };
  return {
    item: await width('item'),
    inner: await width('inner'),
    title: await width('title'),
  };
}

const VARIANTS = ['flex', 'points', 'percent', 'auto'];

describe('classic conformance, the default', () => {
  test('a row item whose inner row grows from nothing collapses, as in React Native', async () => {
    await start(false);
    for (const id of ['flex', 'points', 'percent']) {
      expect(await frames(id), id).toEqual({ item: 8, inner: 0, title: 0 });
      expect(await frames(`box-${id}`), id).toEqual({
        item: 8,
        inner: 0,
        title: 140,
      });
    }
    const auto = await frames('box-auto');
    expect(auto).toEqual({ item: 167, inner: 159, title: 140 });
  });
});

describe('strict conformance', () => {
  test('every basis measures as content, with the widths Chrome gives the same CSS', async () => {
    await start(true);
    for (const id of VARIANTS) {
      expect(await frames(`box-${id}`), id).toEqual({
        item: 167,
        inner: 159,
        title: 140,
      });
    }
  });

  test('a row item with text is as wide as its text', async () => {
    const results = await Promise.all(VARIANTS.map(id => frames(id)));
    for (const result of results) {
      expect(result.title).toBeGreaterThan(100);
      expect(result.item).toBe(result.title + 6 + 13 + 8);
      expect(result).toEqual(results[0]);
    }
  });
});
