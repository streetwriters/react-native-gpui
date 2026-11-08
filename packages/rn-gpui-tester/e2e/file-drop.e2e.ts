import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
let directory: string;
let file: string;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-drop-'));
  file = path.join(directory, 'note.txt');
  fs.writeFileSync(file, 'hello');
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--file-drop',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-file-drop')).toBeVisible();
});

afterAll(async () => {
  await app?.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function centre(testID: string, fx = 0.5, fy = 0.5) {
  const [node] = await app.query('testID', testID, true);
  const top = (await app.menuBarState()).inset;
  return {
    x: node.frame.x + node.frame.width * fx,
    y: node.frame.y + node.frame.height * fy + top,
  };
}

const log = () => app.getByTestId('drop-log').textContent();

async function zoneColour() {
  const image = PNG.sync.read(await app.getByTestId('drop-zone').screenshot());
  const at = (image.width * 0.9 + image.width * 4 * image.height * 0.1) | 0;
  const offset =
    (Math.round(image.height * 0.9) * image.width +
      Math.round(image.width * 0.9)) *
    4;
  void at;
  return Array.from(image.data.subarray(offset, offset + 3));
}

test('files dragged over a view that takes them enter, move, and drop', async () => {
  expect(await log()).toBe('');
  const zone = await centre('drop-zone', 0.9, 0.9);
  const inner = await centre('drop-inner');

  await app.dragFiles([file], zone);
  await app.waitForIdle();
  expect(await log()).toContain('enter(');
  expect(await log()).toContain('note.txt:5:text/plain');
  const [r, g, b] = await zoneColour();
  expect([r, g, b]).toEqual([0x10, 0xb9, 0x81]);

  await app.dragFiles([], inner);
  await app.waitForIdle();
  expect((await log()).match(/enter\(/g)?.length).toBe(1);
  expect((await log()).includes('over')).toBe(true);

  await app.dropFiles(inner);
  await app.waitForIdle();
  const text = await log();
  expect(text).toMatch(/drop\(\d+,\d+\) note\.txt:5:text\/plain$/);
  expect(await zoneColour()).toEqual([0xe5, 0xe7, 0xeb]);
});

test('a view that does not take files gets no events, and leaving sends leave', async () => {
  const before = await log();
  const refuses = await centre('drop-refuses');
  await app.dragFiles([file], refuses);
  await app.dropFiles(refuses);
  await app.waitForIdle();
  expect(await log()).toBe(before);

  await app.dragFiles([file], await centre('drop-zone'));
  await app.dragFilesExit();
  await app.waitForIdle();
  expect(await log()).toMatch(/leave\(/);
});
