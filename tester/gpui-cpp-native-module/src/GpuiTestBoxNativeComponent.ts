import { codegenNativeComponent, type ViewProps } from 'react-native';
// RN 0.87 does not re-export DirectEventHandler from its public entry point.
import type { DirectEventHandler } from 'react-native/Libraries/Types/CodegenTypes';

export type NativeTapEvent = Readonly<{
  value: string;
}>;

export interface NativeProps extends ViewProps {
  label?: string;
  testColor?: string;
  onNativeTap?: DirectEventHandler<NativeTapEvent>;
}

export default codegenNativeComponent<NativeProps>('GpuiTestBox');
