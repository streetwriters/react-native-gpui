import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { expect, test } from 'vitest';
import { matchScreenshot } from '@react-native-gpui/testing';

test('matches desktop screenshot baselines from Vitest', async () => {
  const baselineDir = path.join(
    __dirname,
    '__screenshots__',
    'gpui',
    `${process.platform}-${process.arch}`,
  );
  const originalArgs = process.argv;
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([0, 128, 255, 255]);
  const baseline = PNG.sync.write(image);

  try {
    process.argv = [...originalArgs, '-u'];
    await matchScreenshot(baseline, 'vitest-matcher-smoke');
    process.argv = originalArgs.filter(argument => argument !== '-u');
    await matchScreenshot(baseline, 'vitest-matcher-smoke');
    await expect(
      matchScreenshot(Buffer.from('not a PNG'), 'vitest-invalid-image'),
    ).rejects.toThrow();
  } finally {
    process.argv = originalArgs;
    fs.rmSync(baselineDir, { recursive: true, force: true });
  }
});
