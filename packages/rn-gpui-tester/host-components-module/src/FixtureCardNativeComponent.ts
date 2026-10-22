import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/**
 * A container host component (design 2, section 6.1): it draws a GPUI card
 * around its React children and reports the room its own chrome takes, so the
 * children are laid out inside what is left rather than under the title bar.
 *
 * The insets are fixed so a test can compute the geometry: `chromeHeight` above
 * and below, `chromeWidth` on each side.
 */
export interface NativeProps extends ViewProps {
  title?: string;
  chromeHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 28>;
  chromeWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 12>;
}

export default codegenNativeComponent<NativeProps>('FixtureCard');
