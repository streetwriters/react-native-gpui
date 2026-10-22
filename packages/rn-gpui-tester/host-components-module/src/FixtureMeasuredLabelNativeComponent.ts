import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/**
 * A measured host component: its own content decides its size, which it reports
 * through Fabric state, and its parent lays out around the reported size.
 *
 * The size is derived from the text so a test can compute what it should be:
 * `characterWidth` (default 8) times the length of `text`, and `lineHeight`
 * (default 20) for the single line the fixture draws.
 */
export interface NativeProps extends ViewProps {
  text?: string;
  characterWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 8>;
  lineHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 20>;
}

// `interfaceOnly`: React Native generates the props class and the event emitter
// from this spec, and core supplies the shadow node and the descriptor, so the
// package writes no C++ (design 2, section 5.1).
export default codegenNativeComponent<NativeProps>('FixtureMeasuredLabel', {
  interfaceOnly: true,
});
