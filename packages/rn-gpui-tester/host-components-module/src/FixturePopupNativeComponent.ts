import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  /** Whether the popup is shown; it is when the prop is not set. */
  open?: CodegenTypes.WithDefault<boolean, true>;
  /** The popup's top, in window points. */
  top?: CodegenTypes.Double;
}

export default codegenNativeComponent<NativeProps>('FixturePopup', {
  interfaceOnly: true,
});
