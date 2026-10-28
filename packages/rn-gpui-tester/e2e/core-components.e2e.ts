import http from 'node:http';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
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
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 1500);
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

// The screen is taller than the window: scroll its own scroll view until the
// element can be reached.
async function reveal(testID: string) {
  const [root] = await app.query(
    'testID',
    'tester-screen-core-components',
    true,
  );
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const [match] = await app.query('testID', testID, true);
    if (match?.visible) return;
    await app.scroll(root.tag, 0, -300);
  }
  throw new Error(`${testID} could not be scrolled into view`);
}

async function scrollToTop() {
  const [root] = await app.query(
    'testID',
    'tester-screen-core-components',
    true,
  );
  await app.scroll(root.tag, 0, 5000);
}

afterEach(async () => {
  // Keep every test starting from the top of the screen.
  try {
    await scrollToTop();
  } catch {
    // The app may have been closed by the test.
  }
});

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
        RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      },
      disableAnimations: true,
      offscreen: false,
    });
    await app.focusWindow();
    await app.setWindowSize(1024, 1500);
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

  test('readOnly selects text but rejects edits and draws no caret', async () => {
    const before = await text('input-event-log');
    await app.getByTestId('input-read-only').click();
    await app.getByTestId('input-read-only').press('mod-a');
    await poll(async () => (await text('input-read-only-selection')) === '0-9');
    await app.getByTestId('input-read-only').press('x');
    await app.getByTestId('input-read-only').press('backspace');
    await app.waitForIdle();
    expect(await text('input-event-log')).toBe(before);
    const seen = new Set<string>();
    await app.getByTestId('input-read-only').press('right');
    for (let sample = 0; sample < 8; sample += 1) {
      seen.add(
        (await app.getByTestId('input-read-only').screenshot()).toString(
          'base64',
        ),
      );
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(seen.size).toBe(1);
  });

  test('right click opens a text menu, which contextMenuHidden suppresses', async () => {
    await app.getByTestId('input-menu').rightClick();
    const menu = await app.getContextMenu();
    const ids = ((menu?.items ?? []) as { id?: string }[]).map(item => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(['cut', 'copy', 'paste', 'selectAll']),
    );
    expect(await app.selectContextMenuItem('selectAll')).toBe(true);
    await poll(async () => (await text('input-menu-selection')) === '0-11');
    const shownBefore = (await app.getContextMenu())?.shown;
    await app.getByTestId('input-menu-hidden').rightClick();
    expect((await app.getContextMenu())?.shown).toBe(shownBefore);
  });

  test('numberOfLines sizes a multiline input, which scrolls and reports it', async () => {
    const shot = PNG.sync.read(
      await app.getByTestId('input-multi').screenshot(),
    );
    expect(shot.height / shot.width).toBeCloseTo(60 / 200, 2);
    await app.getByTestId('input-multi').click();
    await app.getByTestId('input-multi').type('!');
    await poll(async () => (await text('input-multi-sizes')).includes('x200,'));
    await app.getByTestId('input-multi').type('\n');
    await poll(async () => (await text('input-multi-sizes')).includes('x220,'));
    // The wheel scrolls the content, and onScroll reports the offset.
    await app.getByTestId('input-multi').scroll(0, -100);
    await poll(async () => Number(await text('input-multi-scroll')) > 0);
    const down = Number(await text('input-multi-scroll'));
    await app.getByTestId('input-multi').scroll(0, 40);
    await poll(async () => Number(await text('input-multi-scroll')) < down);
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
    // The blur is delivered on a frame, which the window draws when asked.
    await poll(async () => {
      await app.waitForIdle();
      const log = await text('input-event-log');
      return log.includes('submit,') && log.includes('end,');
    });
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

describe('Text', () => {
  function pixels(
    image: PNG,
    match: (r: number, g: number, b: number) => boolean,
  ) {
    let count = 0;
    let top = image.height;
    let bottom = -1;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const index = (y * image.width + x) * 4;
        if (
          match(image.data[index], image.data[index + 1], image.data[index + 2])
        ) {
          count += 1;
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return { count, extent: bottom - top };
  }

  test('textShadow* paints a shadow behind the text', async () => {
    const red = (r: number, g: number, b: number) =>
      r > 200 && g < 90 && b < 90;
    const plain = pixels(
      PNG.sync.read(await app.getByTestId('shadow-plain').screenshot()),
      red,
    );
    const shadow = pixels(
      PNG.sync.read(await app.getByTestId('shadow-hard').screenshot()),
      red,
    );
    expect(plain.count).toBe(0);
    expect(shadow.count).toBeGreaterThan(50);

    // A blurred shadow fades out through many grey levels instead of stacking
    // a few copies of the text.
    const soft = PNG.sync.read(
      await app.getByTestId('shadow-soft').screenshot(),
    );
    const levels = new Set<number>();
    for (let index = 0; index < soft.data.length; index += 4) {
      const grey = soft.data[index];
      if (grey > 20 && grey < 235) levels.add(grey);
    }
    expect(levels.size).toBeGreaterThan(40);
  });

  async function box(testID: string) {
    const [match] = await app.query('testID', testID, true);
    return match.frame;
  }

  test('selectable text selects by drag, word and line, and copies', async () => {
    await reveal('select-text');
    const frame = await box('select-text');
    const y = frame.y + frame.height / 2;
    await app.setClipboardText('');
    await app.mouseDown({ x: frame.x + 1, y });
    await app.mouseMove(
      { x: frame.x + frame.width - 1, y },
      { button: 'left' },
    );
    await app.mouseUp({ x: frame.x + frame.width - 1, y });
    await app.getByTestId('select-text').rightClick();
    expect((await app.getContextMenu())?.items).toBeTruthy();
    expect(await app.selectContextMenuItem('copy')).toBe(true);
    await poll(async () => (await app.clipboardText()) === 'alpha beta gamma');
    await app.setClipboardText('');
    await app.getByTestId('select-text').doubleClick();
    await app.getByTestId('select-text').rightClick();
    expect(await app.selectContextMenuItem('copy')).toBe(true);
    await poll(async () => (await app.clipboardText()) === 'beta');
  });

  test('text without selectable offers no selection', async () => {
    await reveal('select-text-off');
    await app.setClipboardText('');
    await app.getByTestId('select-text-off').doubleClick();
    await app.getByTestId('select-text-off').rightClick();
    await app.waitForIdle();
    expect((await app.clipboardText()) ?? '').toBe('');
  });

  test('textTransform and fontVariant change how the text is shaped', async () => {
    const width = async (testID: string) => (await box(testID)).width;
    expect(await width('transform-upper')).toBeGreaterThan(
      (await width('transform-plain')) * 1.08,
    );
    expect(await width('digits-tabular')).toBeGreaterThan(
      await width('digits-plain'),
    );
  });

  test('adjustsFontSizeToFit shrinks text that would not fit on its lines', async () => {
    const dark = (r: number, g: number, b: number) =>
      r < 90 && g < 90 && b < 90;
    const off = pixels(
      PNG.sync.read(await app.getByTestId('fit-off').screenshot()),
      dark,
    );
    const on = pixels(
      PNG.sync.read(await app.getByTestId('fit-on').screenshot()),
      dark,
    );
    expect(on.extent).toBeLessThan(off.extent * 0.9);
  });
});

describe('Pressable', () => {
  test('hover calls onHoverIn and onHoverOut, after delayHoverIn when set', async () => {
    await app.getByTestId('hover-target').hover();
    await poll(async () => (await text('hover-log')).includes('in,'));
    await app.getByTestId('hover-delayed').hover();
    await poll(async () => (await text('hover-log')).includes('out,'));
    await poll(async () => (await text('hover-log')).includes('delayed-in,'));
  });

  test('Space and Enter activate a focused Pressable', async () => {
    await app.getByTestId('press-key').press('enter');
    await poll(async () => (await text('key-presses')) === '1');
    await app.getByTestId('press-key').press('space');
    await poll(async () => (await text('key-presses')) === '2');
  });
});

describe('Image events', () => {
  let server: http.Server;
  const body = (() => {
    const png = new PNG({ width: 400, height: 400 });
    for (let index = 0; index < png.data.length; index += 1) {
      png.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
    }
    return PNG.sync.write(png);
  })();

  beforeAll(async () => {
    server = http.createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': body.length,
      });
      let offset = 0;
      const send = () => {
        if (offset >= body.length) {
          response.end();
          return;
        }
        response.write(body.subarray(offset, offset + 65536));
        offset += 65536;
        setTimeout(send, 40);
      };
      send();
    });
    await new Promise<void>(resolve =>
      server.listen(18765, '127.0.0.1', resolve),
    );
    app.allowErrors(/gpui::asset_cache/);
    await app.getByTestId('image-show').click();
  });
  afterAll(() => server?.close());

  test('onLoadStart, onLoad with the size and onLoadEnd fire in order', async () => {
    await poll(async () => (await text('image-log')).includes('end,'));
    const log = await text('image-log');
    expect(log.indexOf('start,')).toBeLessThan(log.indexOf('load:2x3,'));
    expect(log.indexOf('load:2x3,')).toBeLessThan(log.indexOf('end,'));
  });

  test('onError fires for an image that cannot load', async () => {
    await poll(async () => (await text('image-log')).includes('error,'));
  });

  test('onProgress reports the bytes loaded of the total', async () => {
    await poll(async () => /^\d+\/\d+$/.test(await text('image-progress-log')));
    const [loaded, total] = (await text('image-progress-log'))
      .split('/')
      .map(Number);
    expect(total).toBe(body.length);
    expect(loaded).toBeGreaterThan(0);
  });
});

describe('ScrollView', () => {
  // The scrolls above can leave the screen's own scroll view moved.
  afterAll(async () => {
    const [root] = await app.query(
      'testID',
      'tester-screen-core-components',
      true,
    );
    await app.scroll(root.tag, 0, 5000);
  });

  // The window only draws when the driver asks, so each check asks first.
  async function settled(testID: string, expected: string) {
    let last = '';
    try {
      await poll(async () => {
        await app.waitForIdle();
        last = await text(testID);
        return last === expected;
      }, 8000);
    } catch {
      throw new Error(
        `${testID} was ${JSON.stringify(last)}, not ${JSON.stringify(expected)}`,
      );
    }
  }

  test('a trackpad drag reports drag and momentum, and paging rests on a page', async () => {
    const pager = app.getByTestId('scroll-paged');
    const tag = (await app.query('testID', 'scroll-paged', true))[0].tag;
    await app.scroll(tag, 0, -30, 1, 'started');
    await app.scroll(tag, 0, -40, 1, 'moved');
    await app.scroll(tag, 0, 0, 1, 'ended');
    // Moved events after the fingers lift are the system's momentum.
    await app.scroll(tag, 0, -3, 1, 'moved');
    await app.scroll(tag, 0, -2, 1, 'moved');
    await settled('scroll-log', 'begin,end,mbegin,mend,');
    await settled('scroll-offset', '100');
    await desktopExpect(pager).toBeVisible();
  });

  test('snapToInterval rests on an interval', async () => {
    await reveal('scroll-interval');
    const tag = (await app.query('testID', 'scroll-interval', true))[0].tag;
    await app.scroll(tag, 0, -75, 1, 'started');
    await app.scroll(tag, 0, 0, 1, 'ended');
    await settled('scroll-interval-offset', '80');
  });

  test('a mouse wheel snaps once it stops', async () => {
    const tag = (await app.query('testID', 'scroll-paged', true))[0].tag;
    await app.scroll(tag, 0, -60);
    await settled('scroll-offset', '200');
  });
});

describe('Modal', () => {
  test('Escape asks to close and the modal stays until JS hides it', async () => {
    await app.getByTestId('modal-open').click();
    await desktopExpect(app.getByTestId('modal-body')).toBeVisible();
    await app.getByTestId('modal-body').press('escape');
    await poll(async () => (await text('modal-requests')) === '1');
    await desktopExpect(app.getByTestId('modal-body')).toBeVisible();
    await app.getByTestId('modal-close').click();
    await poll(async () => {
      try {
        await app.getByTestId('modal-body').textContent();
        return false;
      } catch {
        return true;
      }
    });
  });
});

describe('font scale', () => {
  let scaled: DesktopApp;
  beforeAll(async () => {
    scaled = await launchApp({
      bundle: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      env: {
        RN_GPUI_MODULE: 'RNGPUITester--core-components',
        RN_GPUI_DEV_PORT: '1',
        RN_GPUI_TEST_FONT_SCALE: '2',
      },
      disableAnimations: true,
      offscreen: true,
    });
    await scaled.setWindowSize(1024, 1500);
    await desktopExpect(
      scaled.getByTestId('tester-screen-core-components'),
    ).toBeVisible();
  });
  afterAll(() => scaled?.disconnect());

  async function width(testID: string) {
    return PNG.sync.read(await scaled.getByTestId(testID).screenshot()).width;
  }

  test('allowFontScaling and maxFontSizeMultiplier bound the system text scale', async () => {
    const fixed = await width('font-fixed');
    const capped = await width('font-capped');
    const full = await width('font-default');
    expect(capped / fixed).toBeGreaterThan(1.4);
    expect(capped / fixed).toBeLessThan(1.6);
    expect(full / fixed).toBeGreaterThan(1.9);
    expect(full / fixed).toBeLessThan(2.1);
  });
});
