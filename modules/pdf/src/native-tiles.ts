import NativePdfTiles from './NativePdfTiles';
import PdfTile from './PdfTileNativeComponent';
import type { TileSink } from './tiles';

export const nativeTileSink: TileSink = {
  adopt: (pointer, width, height, stride) =>
    NativePdfTiles.adopt(pointer, width, height, stride),
};

export { NativePdfTiles, PdfTile };
