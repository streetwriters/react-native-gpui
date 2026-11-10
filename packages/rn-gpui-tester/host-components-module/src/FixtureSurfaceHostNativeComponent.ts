import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/**
 * A host component whose GPUI content is a `ReactSurface`: a second React root
 * placed in a box GPUI lays out.
 */
export interface NativeProps extends ViewProps {
  module?: string;
  greeting?: CodegenTypes.WithDefault<string, ''>;
}

export default codegenNativeComponent<NativeProps>('FixtureSurfaceHost', {
  interfaceOnly: true,
});
