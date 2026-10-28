import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--core-components',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-core-components'),
  ).toBeVisible();
});

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for the condition: ${check}`);
}

async function text(testID: string) {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

/** The RGBA of the pixel at a fraction of an element's box in its screenshot. */
async function pixel(testID: string, x: number, y: number) {
  const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
  const px = Math.min(image.width - 1, Math.round(image.width * x));
  const py = Math.min(image.height - 1, Math.round(image.height * y));
  const offset = (py * image.width + px) * 4;
  return Array.from(image.data.subarray(offset, offset + 4));
}

describe('Switch', () => {
  test('is measured natively and clicking a controlled switch flips it', async () => {
    const [node] = await app.query('testID', 'switch-controlled', true);
    expect(node.frame.width).toBeGreaterThan(30);
    expect(node.frame.height).toBeGreaterThan(15);
    expect(await text('switch-value')).toBe('false');
    await app.getByTestId('switch-controlled').click();
    await poll(async () => (await text('switch-value')) === 'true');
    expect(await text('switch-changes')).toBe('1');
    await app.getByTestId('switch-controlled').click();
    await poll(async () => (await text('switch-value')) === 'false');
  });

  test('Space toggles a focused switch', async () => {
    await app.getByTestId('switch-controlled').press('space');
    await poll(async () => (await text('switch-value')) === 'true');
    await app.getByTestId('switch-controlled').press('space');
    await poll(async () => (await text('switch-value')) === 'false');
  });

  test('a switch whose value JS never updates springs back', async () => {
    const before = await pixel('switch-refusing', 0.25, 0.5);
    await app.getByTestId('switch-refusing').click();
    await poll(async () => Number(await text('switch-changes')) >= 100);
    await app.waitForIdle();
    // The thumb is back on the left, so the left quarter is thumb-white as before.
    expect(await pixel('switch-refusing', 0.25, 0.5)).toEqual(before);
    expect(await pixel('switch-refusing', 0.75, 0.5)).not.toEqual([
      255, 255, 255, 255,
    ]);
  });

  test('a disabled switch ignores clicks', async () => {
    const changes = await text('switch-changes');
    const [node] = await app.query('testID', 'switch-disabled', true);
    await app.click(node.tag);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(await text('switch-changes')).toBe(changes);
  });

  test('draws the track in the colours it was given, on and off', async () => {
    // Near the left edge and the right edge of the track, away from the thumb.
    const on = await pixel('switch-colored', 0.1, 0.5);
    expect(on.slice(0, 3)).toEqual([0xe9, 0x1e, 0x63]);
    const thumb = await pixel('switch-colored', 0.78, 0.5);
    expect(thumb.slice(0, 3)).toEqual([0xff, 0xeb, 0x3b]);
    const off = await pixel('switch-colored-off', 0.75, 0.5);
    expect(off.slice(0, 3)).toEqual([0xff, 0x98, 0x00]);
  });
});

describe('ActivityIndicator', () => {
  async function drawn(testID: string) {
    const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
    for (let index = 3; index < image.data.length; index += 4) {
      if (image.data[index] !== 0 && image.data[index - 3] < 250) return true;
    }
    return false;
  }

  test('draws while animating and the size follows the prop', async () => {
    expect(await drawn('indicator-small')).toBe(true);
    const [small] = await app.query('testID', 'indicator-small', true);
    const [large] = await app.query('testID', 'indicator-large', true);
    expect(large.frame.width).toBeGreaterThan(small.frame.width);
  });

  test('a stopped indicator hides, unless hidesWhenStopped is false', async () => {
    expect(await drawn('indicator-visible')).toBe(true);
    await app.getByTestId('indicator-toggle').click();
    await poll(async () => (await text('indicator-toggle')) === 'start');
    await app.waitForIdle();
    expect(await drawn('indicator-small')).toBe(false);
  });

  test('a stopped indicator leaves the app idle: it requests no frames', async () => {
    await app.waitForIdle({ timeout: 3000 });
    const status = await app.idleStatus();
    expect(status.idle).toBe(true);
    expect(status.busySources).toEqual([]);
  });
});

describe('TextInput props', () => {
  test('placeholderTextColor colours the placeholder', async () => {
    const image = PNG.sync.read(
      await app.getByTestId('input-placeholder').screenshot(),
    );
    let red = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      if (
        image.data[index] > 200 &&
        image.data[index + 1] < 90 &&
        image.data[index + 2] < 90
      ) {
        red += 1;
      }
    }
    expect(red).toBeGreaterThan(20);
  });

  test('selectTextOnFocus selects all the text on focus', async () => {
    // Focus events only fire in a window that can be active.
    await app.close();
    app = await launchApp({
      bundle: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      env: {
        RN_GPUI_MODULE: 'RNGPUITester--core-components',
        RN_GPUI_DEV_PORT: '1',
      },
      disableAnimations: true,
      offscreen: false,
    });
    await app.focusWindow();
    expect(await text('input-selection')).toBe('none');
    await app.getByTestId('input-select-on-focus').click();
    await poll(async () => (await text('input-selection')) === '0-9');
  });

  test('caretHidden draws no caret while the input is focused', async () => {
    async function frames(testID: string) {
      await app.getByTestId(testID).click();
      const seen = new Set<string>();
      for (let sample = 0; sample < 8; sample += 1) {
        seen.add(
          (await app.getByTestId(testID).screenshot()).toString('base64'),
        );
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return seen.size;
    }
    expect(await frames('input-caret-hidden')).toBe(1);
    // The same input with a caret blinks, so the frames differ.
    expect(await frames('input-placeholder')).toBeGreaterThan(1);
  });

  test('maxLength limits typed and replaced text', async () => {
    await app.getByTestId('input-max-length').click();
    await app.getByTestId('input-max-length').type('abcdefgh');
    await poll(
      async () => (await text('input-max-length-value')) === '[abcde]',
    );
    await app.getByTestId('input-max-length').type('x');
    await app.getByTestId('input-max-length').press('backspace');
    await app.getByTestId('input-max-length').type('yz');
    await poll(
      async () => (await text('input-max-length-value')) === '[abcdy]',
    );
  });

  test('onKeyPress reports each key before it is applied', async () => {
    await app.getByTestId('input-keys').click();
    await app.getByTestId('input-keys').press('a');
    await app.getByTestId('input-keys').press('backspace');
    await app.getByTestId('input-keys').press('tab');
    await poll(async () => (await text('input-key-log')).includes('[Tab]'));
    const log = await text('input-key-log');
    expect(log.indexOf('[a]')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('[a]')).toBeLessThan(log.indexOf('[Backspace]'));
    expect(log.indexOf('[Backspace]')).toBeLessThan(log.indexOf('[Tab]'));
  });

  test('Enter submits and blurs by default, and onEndEditing follows the blur', async () => {
    await app.getByTestId('input-keys').click();
    await app.getByTestId('input-keys').press('enter');
    await poll(async () => (await text('input-event-log')).includes('submit,'));
    await poll(async () => (await text('input-event-log')).includes('end,'));
  });

  test('submitBehavior submit keeps focus after Enter', async () => {
    const count = (log: string) => log.split('keep-end,').length - 1;
    await app.getByTestId('input-submit-keeps-focus').click();
    await new Promise(resolve => setTimeout(resolve, 200));
    const before = count(await text('input-event-log'));
    await app.getByTestId('input-submit-keeps-focus').press('enter');
    await poll(async () => (await text('input-event-log')).includes('keep,'));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(count(await text('input-event-log'))).toBe(before);
  });
});
