import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/**
 * A measured host component: its own content decides its size, which it reports
 * through Fabric state, and its parent lays out around the reported size.
 */
export interface NativeProps extends ViewProps {
  text?: string;
  characterWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 8>;
  lineHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 20>;
}

export default codegenNativeComponent<NativeProps>('FixtureMeasuredLabel', {
  interfaceOnly: true,
});
