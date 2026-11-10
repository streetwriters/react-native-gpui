import NativeSecureStorage from './NativeSecureStorage';

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at++) {
    text += String.fromCharCode(bytes[at]);
  }
  return globalThis.btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = globalThis.atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let at = 0; at < raw.length; at++) bytes[at] = raw.charCodeAt(at);
  return bytes;
}

/** Whether the operating system's credential store can be used. */
export function isAvailable(): Promise<boolean> {
  return NativeSecureStorage.isAvailable();
}

/** Stores `value` in the credential store under `service` and `key`, replacing any earlier value. */
export function setItem(
  service: string,
  key: string,
  value: string,
): Promise<void> {
  return NativeSecureStorage.setItem(service, key, value);
}

/** The value stored under `service` and `key`, or `null` when there is none. */
export function getItem(service: string, key: string): Promise<string | null> {
  return NativeSecureStorage.getItem(service, key);
}

/** Removes the value; resolves `true` when there was one. */
export function deleteItem(service: string, key: string): Promise<boolean> {
  return NativeSecureStorage.deleteItem(service, key);
}

/**
 * Encrypts `plainText` with AES-256-GCM under a key that is created on first
 * use and kept in the credential store for `service`. The key never reaches
 * JavaScript.
 */
export async function encryptString(
  service: string,
  plainText: string,
): Promise<Uint8Array> {
  return fromBase64(
    await NativeSecureStorage.encryptString(service, plainText),
  );
}

/** Decrypts what `encryptString` returned for the same `service`. Rejects when the data was changed or the key is gone. */
export function decryptString(
  service: string,
  encrypted: Uint8Array,
): Promise<string> {
  return NativeSecureStorage.decryptString(service, toBase64(encrypted));
}
