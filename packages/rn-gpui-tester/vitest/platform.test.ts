import { expect, test } from 'vitest';
import Platform from '../../core/src-gpui/Libraries/Utilities/Platform.gpui';
import platformResolution from '../fixtures/platform-resolution';

test('reports a desktop OS and resolves the .gpui implementation', () => {
  expect(['macos', 'windows', 'linux']).toContain(Platform.OS);
  expect(platformResolution).toBe('gpui-platform-file');
});
