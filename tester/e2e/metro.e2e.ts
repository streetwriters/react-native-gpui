import path from 'node:path';
import { launchApp, expect as desktopExpect } from '@react-native-gpui/testing';

test('loads and reloads the app from Metro without a bundle fallback', async () => {
  const app = await launchApp({
    disableAnimations: true,
    offscreen: true,
    env: { RN_GPUI_BUNDLE: path.resolve('.local/does-not-exist.bundle') },
    timeout: 60000,
  });
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  await app.getByTestId('e2e-text-input').type('Metro');
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue('Metro');
  await app.reload();
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue('');
  expect(app.readLogs()).not.toContain('falling back to prebuilt');
});
