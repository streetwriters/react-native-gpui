import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

/**
 * The mixed-rendering matrix: rows are combinations of React Native views and
 * native trees, columns are behaviours. A cell is a real assertion, or a todo
 * naming the step that lets it be written. `docs/mixed-views.md` has the same
 * table.
 */

let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NativeMatrixFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 900);
  await desktopExpect(app.getByTestId('matrix-log')).toBeVisible();
});

afterAll(() => app?.close());

const log = async () =>
  (await app.getByTestId('matrix-log').textContent()) ?? '';

const rgb = (image: PNG, x: number, y: number) => {
  const index = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
};
const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60;

async function shot(testID: string) {
  return PNG.sync.read(await app.getByTestId(testID).screenshot());
}

describe('native tree in a React Native view', () => {
  test('painting and clipping: a rounded overflow clip of the React Native parent cuts the native content', async () => {
    const image = await shot('matrix-clip');
    const scale = image.width / 100;
    expect(isRed(rgb(image, 50 * scale, 30 * scale))).toBe(true);
    expect(isRed(rgb(image, 3 * scale, 3 * scale))).toBe(false);
    expect(isRed(rgb(image, 97 * scale, 57 * scale))).toBe(false);
  });

  test('hit testing: a press lands on the native component, at its place under a transform of the parent', async () => {
    await app.getByTestId('matrix-moved').click();
    await expect.poll(log, { timeout: 5000 }).toContain('moved,');
  });

  test('hit testing: a React Native view over the native tree takes the press, and the native tree gets it where nothing covers it', async () => {
    const [native] = await app.query('testID', 'matrix-covered', true);
    const top = (await app.menuBarState()).inset;
    const press = async (x: number, y: number) => {
      const at = { x: native.frame.x + x, y: native.frame.y + y + top };
      await app.mouseMove(at);
      await app.mouseDown(at);
      await app.mouseUp(at);
      await app.waitForIdle();
    };
    await press(50, 10);
    expect(await log()).toContain('cover,');
    expect(await log()).not.toContain('covered,');
    await press(50, 50);
    expect(await log()).toContain('covered,');
  });

  test('hover: entering and leaving a native component reaches its handlers', async () => {
    await app.getByTestId('matrix-clipped').hover();
    await expect.poll(log, { timeout: 5000 }).toContain('clipped:in,');
    await app.getByTestId('matrix-log').hover();
    await expect.poll(log, { timeout: 5000 }).toContain('clipped:out,');
  });

  test('scrolling: the wheel over a native tree scrolls the React Native scroll view around it, and a press follows the content', async () => {
    const [scroll] = await app.query('testID', 'matrix-scroll', true);
    await app.scroll(scroll.tag, 0, -60);
    await desktopExpect(app.getByTestId('matrix-offset')).toHaveText(
      'offset:60',
    );
    await app.getByTestId('matrix-scrolled').click();
    await expect.poll(log, { timeout: 5000 }).toContain('scrolled,');
  });
});

describe('cells that wait for a later step', () => {
  test.todo(
    'React Native inside a native tree: layout, painting, hit testing, focus, keyboard (NativeSlot, step 3)',
  );
  test.todo(
    'native inside React Native inside native, and deeper alternations (NativeSlot, step 3)',
  );
  test.todo(
    'lists, tables, tabs, dialogs, popovers and menus of either kind containing the other (steps 3 to 5)',
  );
  test.todo(
    'scrolling that a native component owns, with React Native content inside (step 3)',
  );
  test.todo('virtualisation and recycling across the boundary (step 4)');
  test.todo(
    'focus, Tab order and keyboard bubbling across the boundary (step 5)',
  );
  test.todo(
    'text input and IME inside a native tree, and a React Native input beside it',
  );
  test.todo(
    'overlays: a React Native popover from a native view, and a native popover from a React Native view (step 3)',
  );
});
