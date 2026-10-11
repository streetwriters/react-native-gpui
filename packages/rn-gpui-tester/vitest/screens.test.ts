import { expect, test } from 'vitest';
import { findScreen, screens } from '../screenCatalog';

test('starts on overview and resolves directly launchable native module screens', () => {
  expect(findScreen().id).toBe('overview');
  for (const id of [
    'rust-turbomodule',
    'cpp-turbomodule',
    'gpui-component',
    'node-api',
    'node-api-packages',
    'native-view',
    'webview',
  ]) {
    expect(findScreen(id).group).toBe('Native modules');
  }
  expect(new Set(screens.map(screen => screen.id)).size).toBe(screens.length);
  expect(() => findScreen('not-a-screen')).toThrow('Unknown tester screen');
});
