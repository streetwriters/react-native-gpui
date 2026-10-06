import { expect, test } from 'vitest';
import Platform from '../../react-native-gpui/src-gpui/Libraries/Utilities/Platform.gpui';
import platformResolution from '../fixtures/platform-resolution';

test('selects GPUI platform values and the .gpui implementation', () => {
  expect(Platform.OS).toBe('gpui');
  expect(platformResolution).toBe('gpui-platform-file');
});
