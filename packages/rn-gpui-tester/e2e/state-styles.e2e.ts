import path from 'node:path';
import { PNG } from 'pngjs';
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
      RN_GPUI_MODULE: 'RNGPUITester--state-styles',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: false,
    idleOptions: { ignore: ['animations'] },
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-state-styles'),
  ).toBeVisible();
});

afterAll(() => app?.close());

async function color(testID: string) {
  const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
  const x = Math.round(image.width / 2);
  const y = Math.round(image.height / 2);
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 3));
}

function near(actual: number[], hex: string, tolerance = 4) {
  const expected = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return actual.every(
    (channel, i) => Math.abs(channel - expected[i]) <= tolerance,
  );
}

async function expectColor(testID: string, hex: string) {
  const actual = await color(testID);
  expect(near(actual, hex), `${testID} is ${actual}, expected ${hex}`).toBe(
    true,
  );
}

async function centre(testID: string) {
  const [node] = await app.query('testID', testID, true);
  const top = (await app.menuBarState()).inset;
  return {
    x: node.frame.x + node.frame.width / 2,
    y: node.frame.y + node.frame.height / 2 + top,
  };
}

async function away() {
  await app.mouseMove({ x: 1010, y: 760 });
  await app.waitForIdle();
}

async function whilePressed(at: { x: number; y: number }, check: () => void) {
  await app.mouseDown(at);
  try {
    await app.waitForIdle({ ignore: ['gestures'] });
    await check();
  } finally {
    await app.mouseUp(at);
    await app.waitForIdle();
  }
}

const renders = () => app.getByTestId('state-render-count').textContent();

test('hoverStyle and activeStyle repaint without React rendering', async () => {
  await away();
  const before = await renders();
  await expectColor('state-hover', '#3b82f6');

  await app.getByTestId('state-hover').hover();
  await expectColor('state-hover', '#f59e0b');

  await whilePressed(await centre('state-hover'), () =>
    expectColor('state-hover', '#ef4444'),
  );
  await expectColor('state-hover', '#f59e0b');

  await away();
  await expectColor('state-hover', '#3b82f6');
  expect(await renders()).toBe(before);
});

test('activeStyle applies without hoverStyle', async () => {
  await away();
  await expectColor('state-active', '#3b82f6');
  const at = await centre('state-active');
  await app.mouseMove(at);
  await whilePressed(at, () => expectColor('state-active', '#ef4444'));
  await away();
  await expectColor('state-active', '#3b82f6');
});

test('focusStyle applies while the view has focus', async () => {
  await expectColor('state-focus', '#3b82f6');
  const [node] = await app.query('testID', 'state-focus', true);
  await app.focus(node.tag);
  await expectColor('state-focus', '#10b981');
  const [other] = await app.query('testID', 'state-focus-other', true);
  await app.focus(other.tag);
  await app.waitForIdle();
  await expectColor('state-focus', '#3b82f6');
});

test('groupHoverStyle and groupActiveStyle follow the named ancestor', async () => {
  await away();
  await expectColor('state-group-child', '#3b82f6');

  const [group] = await app.query('testID', 'state-group', true);
  const [child] = await app.query('testID', 'state-group-child', true);
  const top = (await app.menuBarState()).inset;
  const insideGroup = {
    x: child.frame.x + child.frame.width + 40,
    y: group.frame.y + group.frame.height / 2 + top,
  };
  await app.mouseMove(insideGroup);
  await app.waitForIdle();
  await expectColor('state-group-child', '#8b5cf6');

  await expectColor('state-group-child-other', '#3b82f6');

  await whilePressed(insideGroup, async () => {
    await expectColor('state-group-child', '#ef4444');
    await expectColor('state-group-child-other', '#3b82f6');
  });

  await away();
  await expectColor('state-group-child', '#3b82f6');
});

test('a state style leaves out a property that is being animated', async () => {
  await away();
  await app.getByTestId('state-animate-toggle').click();
  await app.waitForIdle();

  await app.getByTestId('state-animated').hover();
  await app.waitForIdle();
  await expectColor('state-animated', '#f59e0b');
});
