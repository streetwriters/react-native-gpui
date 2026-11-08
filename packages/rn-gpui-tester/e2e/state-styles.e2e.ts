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
  await app.setWindowSize(1024, 1400);
  await desktopExpect(
    app.getByTestId('tester-screen-state-styles'),
  ).toBeVisible();
});

afterAll(() => app?.close());

async function color(testID: string, atX = 0.5, atY = 0.5) {
  const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
  const x = Math.min(image.width - 1, Math.round(image.width * atX));
  const y = Math.min(image.height - 1, Math.round(image.height * atY));
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 3));
}

function near(actual: number[], hex: string, tolerance = 4) {
  const expected = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return actual.every(
    (channel, i) => Math.abs(channel - expected[i]) <= tolerance,
  );
}

async function expectColor(testID: string, hex: string, atX = 0.5, atY = 0.5) {
  const actual = await color(testID, atX, atY);
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
  await app.mouseMove({ x: 1010, y: 1390 });
  await app.waitForIdle();
}

async function whilePressed(at: { x: number; y: number }, check: () => void) {
  await app.mouseDown(at);
  try {
    await app.waitForIdle({ ignore: ['gestures', 'animations'] });
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
  await app.waitForIdle();
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

test('border colors, text color and transform follow the pointer', async () => {
  await away();
  await expectColor('state-border', '#000000', 0.5, 0.03);
  await app.getByTestId('state-border').hover();
  await expectColor('state-border', '#ef4444', 0.5, 0.03);
  await expectColor('state-border', '#10b981', 0.5, 0.97);
  await away();
  await expectColor('state-border', '#000000', 0.5, 0.03);

  const reds = async () => {
    const image = PNG.sync.read(
      await app.getByTestId('state-text').screenshot(),
    );
    let count = 0;
    for (let at = 0; at < image.data.length; at += 4) {
      if (
        image.data[at] > 200 &&
        image.data[at + 1] < 90 &&
        image.data[at + 2] < 90
      ) {
        count += 1;
      }
    }
    return count;
  };
  expect(await reds()).toBe(0);
  await app.getByTestId('state-text').hover();
  await app.waitForIdle();
  expect(await reds()).toBeGreaterThan(50);
  await away();
  expect(await reds()).toBe(0);

  const blueRun = async (testID: string) => {
    const [node] = await app.query('testID', testID, true);
    const painted = PNG.sync.read(await app.screenshot());
    const pixels = painted.width / 1024;
    const y = Math.round((node.frame.y + node.frame.height / 2) * pixels);
    const x = Math.round((node.frame.x + node.frame.width / 2) * pixels);
    const blue = (at: number) => {
      const i = (y * painted.width + at) * 4;
      return (
        Math.abs(painted.data[i] - 0x3b) < 4 &&
        Math.abs(painted.data[i + 1] - 0x82) < 4 &&
        Math.abs(painted.data[i + 2] - 0xf6) < 4
      );
    };
    let left = x;
    let right = x;
    while (blue(left - 1)) left -= 1;
    while (blue(right + 1)) right += 1;
    return (right - left + 1) / pixels;
  };
  expect(Math.round(await blueRun('state-transform'))).toBe(100);
  await app.getByTestId('state-transform').hover();
  await app.waitForIdle();
  expect(Math.round(await blueRun('state-transform'))).toBe(200);
  await away();
  expect(Math.round(await blueRun('state-transform'))).toBe(100);
});

test('a view mounted under a still pointer is hovered', async () => {
  await away();
  const [toggle] = await app.query('testID', 'state-late-toggle', true);
  await app.focus(toggle.tag);
  await app.waitForIdle();
  const at = await centre('state-late');
  await app.mouseMove(at);
  await app.waitForIdle();
  expect((await app.query('testID', 'state-late-child', true)).length).toBe(0);

  await app.press('enter');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('state-late-child')).toBeVisible();
  await expectColor('state-late-child', '#8b5cf6');

  await away();
  await expectColor('state-late-child', '#3b82f6');
});

test('outline follows hover and focus', async () => {
  await away();
  await expectColor('state-outline', '#ffffff', 0.5, 0.03);
  await app.getByTestId('state-outline').hover();
  await expectColor('state-outline', '#ef4444', 0.5, 0.03);
  await away();
  const [node] = await app.query('testID', 'state-outline', true);
  await app.focus(node.tag);
  await app.waitForIdle();
  await expectColor('state-outline', '#10b981', 0.5, 0.03);
  const [other] = await app.query('testID', 'state-focus-other', true);
  await app.focus(other.tag);
  await app.waitForIdle();
  await expectColor('state-outline', '#ffffff', 0.5, 0.03);
});

test('getProps reports the colors a state style applies and which states hold', async () => {
  await away();
  const props = async (testID: string) => {
    const [node] = await app.query('testID', testID, true);
    return app.getProps(node.tag);
  };
  let hover = await props('state-hover');
  expect(hover.backgroundColor >>> 0).toBe(0xff3b82f6);
  expect(hover.states).toEqual([]);

  await app.getByTestId('state-hover').hover();
  hover = await props('state-hover');
  expect(hover.backgroundColor >>> 0).toBe(0xfff59e0b);
  expect(hover.baseBackgroundColor >>> 0).toBe(0xff3b82f6);
  expect(hover.states).toEqual(['hover']);

  await whilePressed(await centre('state-hover'), async () => {
    const pressed = await props('state-hover');
    expect(pressed.backgroundColor >>> 0).toBe(0xffef4444);
    expect(pressed.states).toEqual(['hover', 'active']);
  });

  await app.getByTestId('state-border').hover();
  const border = await props('state-border');
  expect(border.borderColors.left >>> 0).toBe(0xffef4444);
  expect(border.borderColors.bottom >>> 0).toBe(0xff10b981);

  await app.getByTestId('state-text').hover();
  await app.waitForIdle();
  expect((await props('state-text-label')).textColor >>> 0).toBe(0xffef4444);

  await away();
  expect((await props('state-text-label')).textColor >>> 0).toBe(0xff000000);
  expect((await props('state-hover')).states).toEqual([]);
});

test('ref.focus() and ref.blur() move focus like HTMLElement.focus() and blur()', async () => {
  const props = async (testID: string) => {
    const [node] = await app.query('testID', testID, true);
    return app.getProps(node.tag);
  };
  await away();
  await app.getByTestId('ref-a').click();
  await app.waitForIdle({ ignore: ['gestures', 'animations'] });
  let a = await props('ref-a');
  expect(a.states).toEqual(['focus']);
  expect(a.backgroundColor >>> 0).toBe(0xff10b981);
  expect((await props('ref-b')).states).toEqual([]);

  await app.press('x');
  await app.waitForIdle();
  a = await props('ref-a');
  const b = await props('ref-b');
  expect(a.states).toEqual([]);
  expect(a.backgroundColor >>> 0).toBe(0xff3b82f6);
  expect(b.states).toContain('focus');
  expect(b.backgroundColor >>> 0).toBe(0xff10b981);

  await app.press('x');
  await app.waitForIdle();
  expect((await props('ref-b')).states).toEqual([]);
});
