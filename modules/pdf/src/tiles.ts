import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

export interface TileSink {
  adopt(pointer: number, width: number, height: number, stride: number): number;
}

export const TILE_MIME = 'application/x-gpui-texture';

const MAGIC = 0x58455447;

interface Surface {
  width: number;
  height: number;
  stride: number;
}

class TileBytes extends Uint8Array {
  cost = 8;

  get byteLength() {
    return this.cost;
  }
}

export function tileToken(id: number, cost = 8): Uint8Array {
  const token = new TileBytes(8);
  token.cost = cost;
  const view = new DataView(token.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, id, true);
  return token;
}

export function tileIdOf(bytes: Uint8Array): number | null {
  if (bytes.length !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return view.getUint32(0, true) === MAGIC ? view.getUint32(4, true) : null;
}

export function withNativeTiles(
  runtime: PdfRuntimeModule,
  sink: TileSink,
): PdfRuntimeModule {
  const surfaces = new Map<bigint, Surface>();
  const fn = runtime.fn as unknown as Record<
    string,
    (...args: any[]) => unknown
  >;
  const create = fn.FPDFBitmap_CreateEx;
  const wrapped = {
    ...fn,
    FPDFBitmap_CreateEx(
      width: number,
      height: number,
      format: number,
      pixels: Ptr,
      stride: number,
    ) {
      if (pixels !== 0n) {
        surfaces.set(pixels as bigint, { width, height, stride });
      }
      return create(width, height, format, pixels, stride);
    },
  };
  return {
    ...runtime,
    fn: wrapped as unknown as PdfRuntimeModule['fn'],
    mem: {
      ...runtime.mem,
      free(ptr) {
        surfaces.delete(ptr as bigint);
        runtime.mem.free(ptr);
      },
      readBytes(ptr, length) {
        const surface = surfaces.get(ptr as bigint);
        if (surface && length === surface.stride * surface.height) {
          return tileToken(
            sink.adopt(
              Number(ptr),
              surface.width,
              surface.height,
              surface.stride,
            ),
          );
        }
        return runtime.mem.readBytes(ptr, length);
      },
    },
  };
}

export function createTileImageEncoder() {
  return {
    async encode(
      raster: { width: number; height: number; data: ArrayBuffer },
      _options: unknown,
      signal: AbortSignal,
    ) {
      if (signal.aborted) throw new Error('image encoding aborted');
      const id = tileIdOf(new Uint8Array(raster.data));
      if (id === null) {
        throw new Error('the tile engine did not produce a native tile');
      }
      const token = tileToken(id, raster.width * raster.height * 4);
      return {
        width: raster.width,
        height: raster.height,
        format: 'png' as const,
        mimeType: TILE_MIME,
        source: { kind: 'bytes' as const, bytes: token },
      };
    },
  };
}
