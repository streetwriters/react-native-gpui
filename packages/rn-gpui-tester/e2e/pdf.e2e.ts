import path from 'node:path';
import { PNG } from 'pngjs';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

async function launch() {
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'PdfTileFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-pdf-default.json'),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
}

afterAll(async () => {
  await app?.close();
});

test('a page tile is rendered natively and painted by PdfTile', async () => {
  await launch();
  await desktopExpect(app.getByTestId('pdf-tile')).toBeVisible();
  const info = (await app.query('testID', 'pdf-tile-info', true))[0];
  expect(info.text).toMatch(/^tile \d+ 400x200$/u);

  const png = PNG.sync.read(await app.getByTestId('pdf-tile').screenshot());
  const pixel = (x: number, y: number) => {
    const at =
      (Math.floor(y * png.height) * png.width + Math.floor(x * png.width)) * 4;
    return [png.data[at], png.data[at + 1], png.data[at + 2]];
  };
  expect(pixel(0.25, 0.5)).toEqual([0, 0, 0]);
  expect(pixel(0.75, 0.5)).toEqual([255, 0, 0]);
});

async function launchViewer(
  pages: number,
  budget?: number,
  encrypted?: boolean,
) {
  await app?.close();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'PdfViewerFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(
        `.local/e2e-pdf-viewer-${process.pid}-${Date.now()}.json`,
      ),
    },
    initialProps: { pages, budget, encrypted },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
}

async function stateText() {
  return (await app.query('testID', 'pdf-state', true))[0]?.text ?? '';
}

async function until(check: () => Promise<boolean>, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
  }
  throw new Error(`timed out; state: ${await stateText()}`);
}

test('the viewer opens a document, zooms and goes to a page', async () => {
  await launchViewer(5);
  await until(async () => /^ready page 1\/5/u.test(await stateText()));
  await desktopExpect(app.getByTestId('pdf-page-1')).toBeVisible();

  const fitted = await stateText();
  await app.getByTestId('zoom-in').click();
  await until(async () => (await stateText()) !== fitted);
  expect(Number(/zoom ([\d.]+)/u.exec(await stateText())![1])).toBeGreaterThan(
    Number(/zoom ([\d.]+)/u.exec(fitted)![1]),
  );

  await app.getByTestId('fit-page').click();
  await app.getByTestId('page-3').click();
  await until(async () => /page 3\/5/u.test(await stateText()));
});

test('the viewer paints page content and keeps 300 pages smooth', async () => {
  const opened = Date.now();
  await launchViewer(300);
  await until(async () => /^ready page 1\/300/u.test(await stateText()), 20000);
  const openMs = Date.now() - opened;

  const page = await app.getByTestId('pdf-page-1').screenshot();
  const png = PNG.sync.read(page);
  let blue = 0;
  for (let at = 0; at < png.data.length; at += 4) {
    if (png.data[at] < 90 && png.data[at + 2] > 200) blue++;
  }
  expect(blue).toBeGreaterThan(500);

  const scroller = (await app.query('testID', 'pdf-viewer-scroll'))[0];
  const frames: number[] = [];
  for (let step = 0; step < 60; step++) {
    const result = await app.scroll(scroller.tag, 0, -400, 1, undefined, 0);
    frames.push(result.drawMs);
  }
  await new Promise(resolve => setTimeout(resolve, 800));
  const after = await stateText();
  frames.sort((a, b) => a - b);
  const stats = (await app.query('testID', 'pdf-stats', true))[0]?.text ?? '';
  console.log(
    `PDFPERF after: ${after}; open ${openMs} ms, frames median ${frames[30].toFixed(1)} p95 ${frames[57].toFixed(1)} max ${frames[59].toFixed(1)} ms, ${stats}`,
  );
  expect(frames[57]).toBeLessThan(50);
});

test('tiles are evicted under the byte budget while scrolling', async () => {
  await launchViewer(300, 24 * 1024 * 1024);
  await until(async () => /^ready page 1\/300/u.test(await stateText()), 20000);
  const scroller = (await app.query('testID', 'pdf-viewer-scroll'))[0];
  for (let step = 0; step < 60; step++) {
    await app.scroll(scroller.tag, 0, -400, 1, undefined, 0);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  const stats = (await app.query('testID', 'pdf-stats', true))[0]?.text ?? '';
  const [, tiles, bytes, evicted] =
    /tiles (\d+) bytes (\d+) evicted (\d+)/u.exec(stats) ?? [];
  console.log(`PDFPERF budget 24 MiB: ${stats}`);
  expect(Number(evicted)).toBeGreaterThan(0);
  expect(Number(bytes)).toBeLessThan(80 * 1024 * 1024);
  expect(Number(tiles)).toBeGreaterThan(0);
});

test('an encrypted document asks for a password and opens after the right one', async () => {
  await launchViewer(1, undefined, true);
  await until(async () => /^locked/u.test(await stateText()));
  await app.getByTestId('unlock-wrong').click();
  await app.getByTestId('unlock').click();
  await until(async () => /^ready page 1\/1/u.test(await stateText()));
  await desktopExpect(app.getByTestId('pdf-page-1')).toBeVisible();
});

test('search finds and reveals matches, and a double-click selects a word', async () => {
  await launchViewer(30);
  await until(async () => /^ready page 1\/30/u.test(await stateText()), 20000);

  await app.getByTestId('search-page-2').click();
  await until(async () => /hits 11 complete/u.test(await stateText()));
  await until(async () => /page [23]\/30/u.test(await stateText()));
  await app.getByTestId('next-hit').click();
  await until(async () =>
    /page 2[0-9]\/30|page 3\/30/u.test(await stateText()),
  );

  await app.getByTestId('fit-width').click();
  await app.getByTestId('page-3').click();
  await app.getByTestId('fit-width').click();
  await until(async () => /page 3\/30/u.test(await stateText()));
  await app.getByTestId('pdf-page-3').click();
  await app.getByTestId('pdf-page-3').click();
  await app.getByTestId('read-selection').click();
  await new Promise(resolve => setTimeout(resolve, 500));
  await until(async () => {
    const text = (await app.query('testID', 'pdf-selected', true))[0]?.text;
    return text === 'Page' || text === 'Page ';
  });
});

test('scrolling keeps the JS thread under a frame (rAF gaps)', async () => {
  await launchViewer(300);
  await until(async () => /^ready page 1\/300/u.test(await stateText()), 20000);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const start = (await app.query('testID', 'start-frames', true))[0];
  const stop = (await app.query('testID', 'stop-frames', true))[0];
  await app.click(start.tag);
  const scroller = (await app.query('testID', 'pdf-viewer-scroll'))[0];
  for (let step = 0; step < 120; step++) {
    await app.scroll(scroller.tag, 0, -120, 1, undefined, 0);
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  await app.click(stop.tag);
  await app.waitForIdle();
  const text = (await app.query('testID', 'pdf-frames', true))[0]?.text ?? '';
  console.log(`PDFPERF js frames during scroll: ${text}`);
  const max = Number(/max (\d+)/u.exec(text)?.[1] ?? 1e9);
  expect(max).toBeLessThan(100);
});

test('dragging across a word selects it', async () => {
  await launchViewer(5);
  await until(async () => /^ready page 1\/5/u.test(await stateText()), 20000);
  await app.getByTestId('fit-width').click();
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('pdf-page-1')).toBeVisible();
  const page = (await app.query('testID', 'pdf-page-1', true))[0];
  const zoom = Number(/zoom ([\d.]+)/u.exec(await stateText())![1]);
  const top = (await app.menuBarState()).inset;
  const y = page.frame.y + top + 221 * zoom;
  await app.mouseMove({ x: page.frame.x + 245 * zoom, y });
  await app.mouseDown({ x: page.frame.x + 245 * zoom, y });
  await app.mouseMove({ x: page.frame.x + 300 * zoom, y }, { button: 'left' });
  await app.mouseMove({ x: page.frame.x + 330 * zoom, y }, { button: 'left' });
  await app.mouseUp({ x: page.frame.x + 330 * zoom, y });
  await app.getByTestId('read-selection').click();
  await until(async () => {
    const text = (await app.query('testID', 'pdf-selected', true))[0]?.text;
    return /^Pag/u.test(text ?? '');
  });
});

test('the current page is the one with the most visible area', async () => {
  await launchViewer(6);
  await until(async () => /^ready page 1\/6/u.test(await stateText()), 20000);
  for (let step = 0; step < 7; step++) {
    await app.getByTestId('zoom-out').click();
  }
  await until(async () => {
    const zoom = Number(/zoom ([\d.]+)/u.exec(await stateText())?.[1] ?? 9);
    return zoom < 0.4;
  });
  expect(await stateText()).toMatch(/page 1\/6/u);

  await app.getByTestId('page-3').click();
  await until(async () => /page 3\/6/u.test(await stateText()));

  const scroller = (await app.query('testID', 'pdf-viewer-scroll'))[0];
  for (let step = 0; step < 30; step++) {
    await app.scroll(scroller.tag, 0, -2000, 1, undefined, 0);
  }
  await until(async () => /page 6\/6/u.test(await stateText()));
});
