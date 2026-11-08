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
      RN_GPUI_MODULE: 'RNGPUITester--intl',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-intl')).toBeVisible();
});

afterAll(() => app?.close());

test('Intl has what the pinned Hermes provides and formats with the system ICU', async () => {
  const report = (await app.getByTestId('intl-report').textContent()).split(
    '|',
  );
  for (const present of [
    'Collator',
    'DateTimeFormat',
    'NumberFormat',
    'getCanonicalLocales',
  ]) {
    expect(report).toContain(`${present}:function`);
  }
  expect(report).toContain('date=1/15/2024');
  expect(report).toContain('number=1,234,567.891');
  expect(report).toContain('compare=-1');
  expect(report).toContain('locales=en-US');
  expect(report).toContain('toLocaleString=1,234.5');
});
