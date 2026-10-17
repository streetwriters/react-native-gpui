// Walks the manual headed checklist in `C5_SCREENS_PLAN.md` §7.2 against a
// visible window, driving the same interactions a person would, and saves a
// screenshot of each state so the result can be looked at afterwards.
//
//   RN_GPUI_TEST_HEADED=1 node scripts/screens-checklist.mts
//
// The screenshots land in the directory given by `--out`, default
// `.local/c5-7.2`.
import fs from 'node:fs';
import path from 'node:path';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

const outDir = (() => {
  const index = process.argv.indexOf('--out');
  return path.resolve(index === -1 ? '.local/c5-7.2' : process.argv[index + 1]);
})();
fs.mkdirSync(outDir, { recursive: true });
const bundle = path.resolve(
  'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
);

let step = 0;
async function shot(app: DesktopApp, name: string) {
  if (!app.captureSupported) return;
  step += 1;
  const file = path.join(
    outDir,
    `${String(step).padStart(2, '0')}-${name}.png`,
  );
  fs.writeFileSync(file, await app.screenshot());
  console.log(`[shot] ${path.basename(file)}`);
}

async function withScenario(
  scenario: string,
  body: (app: DesktopApp) => Promise<void>,
) {
  const app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'NavigationFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_DEBUG_SCREENS: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(
        `.local/e2e-NavigationFixture-${scenario}.json`,
      ),
    },
    initialProps: { scenario },
    // Animations on: this checklist is about what the animations look like.
    disableAnimations: false,
    offscreen: false,
  });
  await app.setWindowSize(1024, 768);
  try {
    await body(app);
  } finally {
    await app.close();
  }
}

// 1. push: slide in, parallax on the previous card.
await withScenario('native-stack', async app => {
  await shot(app, 'native-stack-home');
  await app.getByText('Open details').click();
  await shot(app, 'native-stack-details-pushed');
  // A second push, so the stack is two deep and Escape has an outer stack.
  await app.getByTestId('details-1-next').click();
  await shot(app, 'native-stack-details-2');
});

// 3. Escape pops the outer stack once, and navigation still works after.
await withScenario('native-stack', async app => {
  await app.getByText('Open details').click();
  await app.getByTestId('details-1-next').click();
  await app.press('escape');
  await app.waitForIdle();
  await shot(app, 'native-stack-after-escape');
});

// 5. hidden header: content starts at the top.
await withScenario('native-stack-hidden', async app => {
  await shot(app, 'hidden-header-home');
});

// 6. modal and transparent modal: backdrop and sheet, screen underneath.
for (const scenario of [
  'native-stack-modal',
  'native-stack-transparent-modal',
]) {
  await withScenario(scenario, async app => {
    await app.getByText('Open details').click();
    await shot(app, `${scenario}-sheet`);
  });
}

// 7. full-window overlay above the app.
await withScenario('native-stack-overlay', async app => {
  await shot(app, 'overlay');
});

// 8. nested: the inner stack does not animate, Escape goes to the outer stack.
await withScenario('nested', async app => {
  await shot(app, 'nested-home');
});

console.log(`[done] screenshots in ${outDir}`);
