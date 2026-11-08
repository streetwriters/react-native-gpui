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
      RN_GPUI_MODULE: 'RNGPUITester--props-probe',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-props-probe'),
  ).toBeVisible();
});

afterAll(() => app?.close());

test('getProps reports border colors, radii, shadows and opacity', async () => {
  const [box] = await app.query('testID', 'probe-box', true);
  const props = await app.getProps(box.tag);
  expect(props.borderColors).toEqual({
    left: 0xff0000ff,
    top: 0xffff0000,
    right: 0,
    bottom: 0xff00ff00,
  });
  expect(props.borderWidths).toMatchObject({
    left: 3,
    top: 2,
    right: 0,
    bottom: 1,
  });
  expect(props.borderRadii.topLeft).toBe(6);
  expect(props.opacity).toBeCloseTo(0.5, 2);
  expect(props.boxShadows).toHaveLength(1);
  expect(props.boxShadows[0]).toMatchObject({
    offsetX: 2,
    offsetY: 3,
    blurRadius: 4,
    spreadDistance: 1,
    inset: false,
  });
});

test('getProps reports text color, line height and letter spacing per fragment', async () => {
  const [text] = await app.query('testID', 'probe-text', true);
  const props = await app.getProps(text.tag);
  const [plain, nested] = props.paragraphFragments;
  expect(plain.color).toBe(0xff336699);
  expect(plain.lineHeight).toBe(22);
  expect(plain.letterSpacing).toBeCloseTo(0.5, 2);
  expect(nested.color).toBe(0xffcc0000);
  expect(nested.letterSpacing).toBeCloseTo(2, 2);
  expect(props.textColor).toBe(0xff336699);
});

test('getProps reports every background color as the 8-bit value it was given', async () => {
  const expected: Record<string, number> = {
    hex6: 0xff008837,
    hex8: 0x26008837,
    rgba: 0x26008837,
    rgb: 0xff0c2238,
    short: 0xff00ff00,
    named: 0xffff6347,
    hsl: 0xff008000,
    transparent: 0,
    white: 0xffffffff,
    almost: 0xfe010203,
  };
  for (const [name, color] of Object.entries(expected)) {
    const [node] = await app.query('testID', `color-${name}`, true);
    const props = await app.getProps(node.tag);
    expect(props.backgroundColor >>> 0, name).toBe(color >>> 0);
  }
});
