import fs from 'node:fs';
import path from 'node:path';

const golden = path.resolve('packages/rn-gpui-tester/e2e/golden');

/**
 * A Chromium reference for the platform the test runs on: the file in
 * `golden/<platform>/` if there is one, else the macOS one directly in
 * `golden/`. Text is drawn by a different rasteriser on each platform, so a
 * platform is compared with Chromium on that platform;
 * `scripts/capture-chromium-references.mjs` captures a platform's.
 */
export function goldenFile(name: string): string {
  const own = path.join(golden, process.platform, name);
  return fs.existsSync(own) ? own : path.join(golden, name);
}
