import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { matchScreenshot } from '@react-native-gpui/testing';

test('creates, compares and reports screenshot baselines', async () => {
  const baselinePath = path.join(
    __dirname,
    '__screenshots__',
    'gpui',
    `${process.platform}-${process.arch}`,
    'matcher-smoke.png',
  );
  const originalArgs = process.argv;
  const image = new PNG({ width: 2, height: 2 });
  image.data.fill(255);
  const baseline = PNG.sync.write(image);

  try {
    process.argv = [...originalArgs, '-u'];
    await matchScreenshot(baseline, 'matcher-smoke');
    process.argv = originalArgs.filter(argument => argument !== '-u');
    await expect(
      matchScreenshot(baseline, 'matcher-smoke'),
    ).resolves.toBeUndefined();

    const changed = PNG.sync.read(baseline);
    changed.data[0] = 0;
    await expect(
      matchScreenshot(PNG.sync.write(changed), 'matcher-smoke'),
    ).rejects.toThrow('differs by');
  } finally {
    process.argv = originalArgs;
    fs.rmSync(path.dirname(baselinePath), { recursive: true, force: true });
  }
});
