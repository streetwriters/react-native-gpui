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
  /** Sets the text in its font and wraps it to the width Yoga offers. */
  wrapText?: CodegenTypes.WithDefault<boolean, false>;
}

export default codegenNativeComponent<NativeProps>('FixtureMeasuredLabel', {
  interfaceOnly: true,
});
