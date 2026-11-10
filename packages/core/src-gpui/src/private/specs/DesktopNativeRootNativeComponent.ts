/**
 * The box that shows a native tree: components of one family that a second React
 * reconciler describes and the runtime builds as GPUI elements, with no Fabric
 * node each. Sized by layout like any view.
 *
 * The name must end in `NativeComponent.ts`; see
 * `DesktopShortcutScopeNativeComponent.ts` for why.
 *
 * @format
 */

import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

/** Something an instance of the tree tells JavaScript. */
export type NativeRootEvent = Readonly<{
  /** The instance that sent it. */
  id: CodegenTypes.Double;
  /** The prop that holds the handler, such as `onPress`. */
  name: string;
  payload?: CodegenTypes.UnsafeMixed;
}>;

export interface NativeProps extends ViewProps {
  /** The tree this node shows. */
  rootId: CodegenTypes.Int32;
  onNativeEvent?: CodegenTypes.DirectEventHandler<NativeRootEvent>;
}

export default codegenNativeComponent<NativeProps>('DesktopNativeRoot');
