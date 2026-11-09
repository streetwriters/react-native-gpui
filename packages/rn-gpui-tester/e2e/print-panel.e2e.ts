import path from 'node:path';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

const enabled = process.env.RN_GPUI_TEST_PRINT_PANEL === '1';
let app: DesktopApp | undefined;

afterAll(async () => {
  await app?.close();
});

test.skipIf(!enabled)(
  'the print panel opens on a click and reports printed or cancelled',
  async () => {
    const bundle = path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    );
    app = await launchApp({
      bundle,
      env: {
        RN_GPUI_MODULE: 'TypstPrintPanelFixture',
        RN_GPUI_BUNDLE: bundle,
        RN_GPUI_DEV_PORT: '1',
        RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-print-panel.json'),
      },
      initialProps: {},
      disableAnimations: true,
    });
    await app.setWindowSize(800, 600);
    await desktopExpect(app.getByTestId('open-print-panel')).toBeVisible();
    await app.getByTestId('open-print-panel').click();
    const deadline = Date.now() + 110_000;
    let status = '';
    while (Date.now() < deadline) {
      status =
        (await app.query('testID', 'print-panel-status', true))[0]?.text ?? '';
      if (status === 'printed' || status === 'cancelled') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    expect(['printed', 'cancelled']).toContain(status);
  },
  120_000,
);
