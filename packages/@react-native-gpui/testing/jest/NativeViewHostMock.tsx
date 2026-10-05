import React from 'react';
import { View, type ViewProps } from 'react-native';

export type NativeViewHostProps = ViewProps & {
  viewName: string;
  nativeProps?: Record<string, unknown>;
};

export default function NativeViewHostMock({
  viewName: _viewName,
  nativeProps: _nativeProps,
  ...props
}: NativeViewHostProps): React.JSX.Element {
  return <View {...props} />;
}
