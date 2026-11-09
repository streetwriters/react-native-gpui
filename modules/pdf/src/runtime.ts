import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

type Addon = Record<string, any>;

const NULL_PTR = 0n as Ptr;

function unsupported(name: string): () => never {
  return () => {
    throw new Error(`${name} is not available in this runtime`);
  };
}

function exactBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

export { NULL_PTR };

export function createPdfRuntimeFromAddon(
  addon: Addon,
  platform: string,
): PdfRuntimeModule {
  const at = (ptr: Ptr, offset: number) =>
    (offset === 0 ? ptr : (ptr as bigint) + BigInt(offset)) as Ptr;

  const fileAccess = (handle: bigint) => {
    let closed = false;
    return {
      ptr: addon.getFileAccessPtr(handle) as Ptr,
      close() {
        if (closed) return;
        closed = true;
        addon.destroyFileAccess(handle);
      },
    };
  };

  const fn: Record<string, unknown> = {};
  for (const name of Object.keys(addon)) {
    if (
      typeof addon[name] === 'function' &&
      /^(FPDF|FORM|EPDF|FSDK)/.test(name)
    ) {
      fn[name] = addon[name].bind(addon);
    }
  }

  return {
    kind: 'native',
    platform,
    mem: {
      alloc: bytes => addon.alloc(bytes) as Ptr,
      free: ptr => addon.free(ptr),
      readBytes: (ptr, len) => new Uint8Array(addon.readBytes(ptr, len)),
      writeBytes: (ptr, data) => addon.writeBytes(ptr, exactBuffer(data)),
      readU8String: ptr => addon.readU8String(ptr),
      writeU8String: text => addon.writeU8String(text) as Ptr,
      readU16String: ptr => addon.readU16String(ptr),
      writeU16String: text => addon.writeU16String(text) as Ptr,
      peek: (ptr, kind, offset = 0) => addon.peek(at(ptr, offset), kind),
      poke: (ptr, kind, value, offset = 0) =>
        addon.poke(at(ptr, offset), kind, value),
    },
    cb: {
      register: unsupported('callbacks'),
      dispose() {},
    },
    fileAccess: {
      fromMemory: bytes =>
        fileAccess(addon.createMemoryFileAccess(exactBuffer(bytes))),
      fromNodeFile: path => fileAccess(addon.createPathFileAccess(path)),
      readRange: unsupported('readRange'),
      sizeOf: unsupported('sizeOf'),
    },
    fileWrite: {
      toNodeFile(path) {
        const handle = addon.createPathFileWrite(path);
        let closed = false;
        return {
          ptr: addon.getFileWritePtr(handle) as Ptr,
          close() {
            if (closed) return;
            closed = true;
            addon.destroyFileWrite(handle);
          },
        };
      },
      writeRange: unsupported('writeRange'),
      appendBytes: unsupported('appendBytes'),
      removeFile: unsupported('removeFile'),
    },
    fn: fn as unknown as PdfRuntimeModule['fn'],
    async destroy() {},
  };
}
