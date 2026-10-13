#!/usr/bin/env node
/**
 * Relocation proof for `collect-node-addons` (Part F of the Node addons plan).
 *
 * A development build loads an addon through the absolute path the Babel plugin
 * embedded, so it only works on the machine that built the bundle. A packaged
 * app copies the addon to `<exeDir>/node-addons/<key>` and relies on the loader
 * finding it there. This script proves that second path really works, and that
 * its absence fails loudly:
 *
 *   1. copy the built app binary to `<tmp>/app/` and collect the addons the
 *      bundle names into `<tmp>/app/node-addons`;
 *   2. move the fixture's addon binary aside, so the embedded absolute path is
 *      dead and the only way to load it is the collected copy;
 *   3. launch the copied binary from `<tmp>/app/` — the addon must load;
 *   4. delete `<tmp>/app/node-addons` and launch again — the call must now fail
 *      with `MODULE_NOT_FOUND`, and the error must list every location tried;
 *   5. put the fixture's addon back.
 *
 * It is a script rather than an e2e test because it moves a file that another
 * test's addon load also depends on, which is not safe to do while the e2e
 * files run in parallel. Run it by hand:
 *
 *   node packages/rn-gpui-tester/scripts/check-node-addon-relocation.mjs
 *
 * It needs `RN_GPUI_TEST_BINARY` (the built test app) and the e2e bundle; the
 * e2e runner sets both, so `npm run test:e2e` can call it, but a hand run needs
 * them set:
 *
 *   RN_GPUI_TEST_BINARY=<path to desktop/build/test-app> \
 *     node packages/rn-gpui-tester/scripts/check-node-addon-relocation.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp } from '@react-native-gpui/testing';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(projectRoot, '..', '..');
const bundlePath = path.join(projectRoot, 'desktop/build/test-e2e.bundle');

/** Prints a failure and exits non-zero, always restoring the fixture first. */
let restore = () => {};
function fail(message) {
  restore();
  console.error(`[relocation] FAILED: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(bundlePath)) {
  fail(
    `the e2e bundle is missing: ${bundlePath}\n` +
      'Run `npm run test:e2e` once, or build it with react-native bundle.',
  );
}
const binary = process.env.RN_GPUI_TEST_BINARY;
if (!binary || !fs.existsSync(binary)) {
  fail(
    'RN_GPUI_TEST_BINARY must point at the built test app; see this file’s ' +
      'header for the exact command.',
  );
}

// The fixture addon is the one the bundle embeds an absolute path for, and its
// `build/` directory is what gets renamed to make that path dead.
const fixtureBuild = path.join(projectRoot, 'node-addon-fixture/build');
const fixtureAddon = path.join(fixtureBuild, 'addon.node');
if (!fs.existsSync(fixtureAddon)) {
  fail(
    `the fixture addon is missing: ${fixtureAddon}\n` +
      'Run node packages/rn-gpui-tester/scripts/build-node-addon.mjs first.',
  );
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-gpui-relocation-'));
const appDirectory = path.join(temporary, 'app');
const addonDirectory = path.join(appDirectory, 'node-addons');
// The fixture binary is moved aside *within its own directory* rather than into
// `temporary`. `os.tmpdir()` is frequently a different filesystem from the
// checkout — `/tmp` and `/home` are separate mounts on the Linux box — and
// `fs.renameSync` cannot cross filesystems (it fails with EXDEV). A sibling
// name in the same directory always can.
const movedAddon = `${fixtureAddon}.moved-for-relocation`;
fs.mkdirSync(appDirectory, { recursive: true });
const copiedBinary = path.join(appDirectory, path.basename(binary));
fs.copyFileSync(binary, copiedBinary);
fs.chmodSync(copiedBinary, 0o755);

// Windows has no rpath: a copied executable still finds its libraries through
// the loader's search order, which starts with the directory of the image being
// loaded. So the app's own DLLs have to travel with it, which is also what a
// packaged Windows app does. macOS and Linux resolve their libraries by path
// (`@rpath`/`$ORIGIN` or the linker's recorded name) and need nothing here.
if (process.platform === 'win32') {
  const binaryDirectory = path.dirname(binary);
  const siblingLibraries = fs
    .readdirSync(binaryDirectory)
    .filter(name => name.toLowerCase().endsWith('.dll'));
  for (const library of siblingLibraries) {
    fs.copyFileSync(
      path.join(binaryDirectory, library),
      path.join(appDirectory, library),
    );
  }
  console.log(
    `[relocation] copied ${siblingLibraries.length} sibling librar(ies) beside the executable`,
  );
}

console.log(`[relocation] work directory: ${temporary}`);
console.log(`[relocation] copied ${binary} -> ${copiedBinary}`);

restore = () => {
  if (fs.existsSync(movedAddon) && !fs.existsSync(fixtureAddon)) {
    fs.renameSync(movedAddon, fixtureAddon);
    console.log('[relocation] restored the fixture addon');
  }
  fs.rmSync(temporary, { recursive: true, force: true });
};

/**
 * Launches the copied binary and runs the addon screen, returning the text the
 * screen shows. `RN_GPUI_NODE_ADDON_PATH` is deliberately not set: the whole
 * point is that the loader finds `node-addons/` beside the executable on its
 * own.
 */
async function runScreen() {
  const app = await launchApp({
    executable: copiedBinary,
    bundle: bundlePath,
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--node-api',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
    logFile: path.join(temporary, 'app.log'),
  });
  try {
    await app.getByTestId('native-module-run').click();
    await app.waitForIdle();
    const nodes = await app.query('testID', 'native-module-result', true);
    return JSON.stringify(nodes);
  } finally {
    await app.close();
  }
}

try {
  // 1. Collect the addons beside the copied executable.
  console.log('[relocation] collecting addons');
  const collect = spawnSync(
    process.execPath,
    [
      path.join(
        repoRoot,
        'packages/@react-native-gpui/cli/bin/react-native-gpui.js',
      ),
      'collect-node-addons',
      '--bundle',
      bundlePath,
      '--out',
      addonDirectory,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  process.stdout.write(collect.stdout ?? '');
  process.stderr.write(collect.stderr ?? '');
  if (collect.status !== 0) {
    fail(`collect-node-addons exited ${collect.status}`);
  }
  if (!fs.existsSync(addonDirectory)) {
    fail('collect-node-addons did not create the output directory');
  }

  // 2. Make the embedded absolute path dead, so only the collected copy can
  //    satisfy the load.
  console.log(`[relocation] renaming ${fixtureAddon} -> ${movedAddon}`);
  fs.renameSync(fixtureAddon, movedAddon);

  // 3. With the collected copy present the screen must work.
  console.log('[relocation] launching with node-addons/ present');
  const loaded = await runScreen();
  // The fixture addon's own values: 19 + 23 synchronous, 20 + 22 through
  // napi_create_async_work, and 42 from a worker thread.
  if (!/42 \/ 42 \/ tsfn 42/u.test(loaded)) {
    fail(
      'the addon did not load from the collected directory.\n' +
        `screen text: ${loaded}`,
    );
  }
  console.log('[relocation] the collected addon loaded');

  // 4. Without it the call must fail with MODULE_NOT_FOUND and name where it
  //    looked — including the app's node-addons directory and the (now dead)
  //    embedded path.
  console.log('[relocation] removing node-addons/ and relaunching');
  fs.rmSync(addonDirectory, { recursive: true, force: true });
  let missingText;
  try {
    missingText = await runScreen();
  } catch (error) {
    // The screen sets the message into its own state, but a hard crash on the
    // window's JS thread can surface as a launch error instead.
    missingText = `${error instanceof Error ? error.message : String(error)}`;
  }
  if (!missingText.includes('MODULE_NOT_FOUND')) {
    fail(
      'the addon loaded with node-addons/ removed. The embedded path was ' +
        'still live, so this run proved nothing.\n' +
        `screen text: ${missingText}`,
    );
  }
  // The error must name every place it looked: the app's own `node-addons/`
  // directory and the embedded absolute path (which is now dead). `runScreen`
  // returns `JSON.stringify` of the queried nodes, so a Windows path arrives
  // with every separator doubled and has to be escaped before comparing.
  for (const needle of [path.join(appDirectory, 'node-addons'), fixtureAddon]) {
    if (!missingText.includes(JSON.stringify(needle).slice(1, -1))) {
      fail(
        `the MODULE_NOT_FOUND error does not mention '${needle}'.\n` +
          `screen text: ${missingText}`,
      );
    }
  }
  console.log('[relocation] the missing addon failed as expected');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

restore();
console.log(
  '[relocation] OK: the collected addon loads, and its absence reports ' +
    'MODULE_NOT_FOUND with every location tried',
);
