import NativeImageManipulator from './NativeImageManipulator';

export enum SaveFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

export interface ResizeAction {
  resize: { width?: number; height?: number };
}

export interface CropAction {
  crop: { originX: number; originY: number; width: number; height: number };
}

export interface RotateAction {
  rotate: number;
}

export interface FlipAction {
  flip: 'vertical' | 'horizontal';
}

export type Action = ResizeAction | CropAction | RotateAction | FlipAction;

export interface SaveOptions {
  /** Encoder quality from 0 to 1 (JPEG only). Defaults to 1. */
  compress?: number;
  /** Defaults to JPEG. */
  format?: SaveFormat;
  /** Also return the encoded image as a base64 string. */
  base64?: boolean;
}

export interface ImageResult {
  /** A `file://` URI of the written image. */
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

/**
 * Applies `actions` in order to the image at `uri` and encodes the result.
 *
 * `uri` is a file path, a `file://` URI or a `data:` URI. A JPEG's EXIF
 * orientation is applied first, and transparency is flattened onto white when
 * the result is a JPEG. The result is written to the app's cache folder.
 */
export function manipulateAsync(
  uri: string,
  actions: Action[] = [],
  options: SaveOptions = {},
): Promise<ImageResult> {
  return NativeImageManipulator.manipulate(uri, actions, {
    compress: options.compress ?? 1,
    format: options.format ?? SaveFormat.JPEG,
    base64: options.base64 ?? false,
  }) as Promise<ImageResult>;
}

export default { manipulateAsync, SaveFormat };
