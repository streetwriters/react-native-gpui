import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Platform from '../../packages/react-native-gpui/src-gpui/Libraries/Utilities/Platform.gpui';
import platformResolution from '../fixtures/platform-resolution';

function PlatformFixture(): React.JSX.Element {
  return <Text>{platformResolution}</Text>;
}

test('selects the GPUI implementation and reports the GPUI platform', async () => {
  expect(Platform.OS).toBe('gpui');
  const result = await render(<PlatformFixture />);
  expect(result.getByText('gpui-platform-file')).toBeTruthy();
});
