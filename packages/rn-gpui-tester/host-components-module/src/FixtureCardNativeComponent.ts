import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/**
 * A container host component: it draws a GPUI card
 * around its React children and reports the room its own chrome takes, so the
 * children are laid out inside what is left rather than under the title bar.
 */
export interface NativeProps extends ViewProps {
  title?: string;
  chromeHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 28>;
  chromeWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 12>;
}

export default codegenNativeComponent<NativeProps>('FixtureCard', {
  interfaceOnly: true,
});
