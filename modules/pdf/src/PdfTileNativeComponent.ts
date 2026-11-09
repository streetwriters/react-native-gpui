import {
  codegenNativeComponent,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  tileId?: CodegenTypes.Int32;
}

export type PdfTileType = HostComponent<NativeProps>;

export default codegenNativeComponent<NativeProps>('PdfTile', {
  interfaceOnly: true,
});
