import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
beforeAll(async () => {
  app = await launchApp({
    disableAnimations: true,
    idleOptions: { ignore: ['animations'] },
  });
});

test('renders the React Native app', async () => {
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('desktop-app-root')).toBeVisible();
});
