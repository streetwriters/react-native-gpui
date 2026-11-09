import { afterEach, describe, expect, test } from 'vitest';
import { createPdfEngine } from './engine';

const scope = globalThis as unknown as { crypto?: unknown };
const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'crypto', original);
  else delete scope.crypto;
});

function install(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('createPdfEngine and random bytes', () => {
  test('throws without crypto.getRandomValues', () => {
    install(undefined);
    expect(() => createPdfEngine({ fallbackFonts: false })).toThrow(
      /secure crypto\.getRandomValues/u,
    );
    install({});
    expect(() => createPdfEngine({ fallbackFonts: false })).toThrow(
      /secure crypto\.getRandomValues/u,
    );
  });

  test('works with it and leaves the global untouched', () => {
    const getRandomValues = (bytes: Uint8Array) => bytes;
    const host = { getRandomValues };
    install(host);
    expect(() => createPdfEngine({ fallbackFonts: false })).not.toThrow();
    expect(scope.crypto).toBe(host);
    expect(host.getRandomValues).toBe(getRandomValues);
  });

  test('never defines crypto.getRandomValues itself', () => {
    install({});
    expect(() => createPdfEngine({ fallbackFonts: false })).toThrow();
    expect(
      (scope.crypto as { getRandomValues?: unknown }).getRandomValues,
    ).toBeUndefined();
  });
});
