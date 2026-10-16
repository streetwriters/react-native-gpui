import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export type FixtureBadgeTappedEvent = Readonly<{
  count: Int32;
}>;

export interface NativeProps extends ViewProps {
  label?: string;
  tickCount?: CodegenTypes.WithDefault<Int32, 0>;
  onFixtureBadgeTapped?: CodegenTypes.DirectEventHandler<FixtureBadgeTappedEvent>;
}

export default codegenNativeComponent<NativeProps>('FixtureBadge');
