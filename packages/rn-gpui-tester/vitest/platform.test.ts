import { expect, test } from 'vitest';
import Platform from '../../core/src-gpui/Libraries/Utilities/Platform.desktop';
import platformResolution from '../fixtures/platform-resolution';

test('reports a desktop OS and resolves the .desktop implementation', () => {
  expect(['macos', 'windows', 'linux']).toContain(Platform.OS);
  expect(platformResolution).toBe('desktop-platform-file');
});
