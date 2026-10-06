import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export type NativeTapEvent = Readonly<{
  value: string;
}>;

export interface NativeProps extends ViewProps {
  label?: string;
  testColor?: string;
  onNativeTap?: CodegenTypes.DirectEventHandler<NativeTapEvent>;
}

export default codegenNativeComponent<NativeProps>('GpuiTestBox');
