import NativeWebauthn from './NativeWebauthn';

export type BufferInput = ArrayBuffer | ArrayBufferView;

export interface RegisterOptions {
  /** The relying party id: the domain the credential belongs to. */
  rpId: string;
  rpName: string;
  userId: BufferInput;
  userName: string;
  displayName?: string;
  /** The security key's PIN. Without it the call rejects with `ERR_WEBAUTHN_PIN_REQUIRED`. */
  pin?: string;
}

export interface Registered {
  credentialId: Uint8Array;
  /** Always `['usb']`: the keys this module talks to are plugged in. */
  transports: string[];
  /** Whether the key supports the PRF (hmac-secret) extension for the credential. */
  prfEnabled: boolean;
}

export interface PrfOptions {
  rpId: string;
  credentialId: BufferInput;
  /**
   * The PRF input, as `prf.eval.first` is in a browser. The key evaluates its
   * secret over the hash of it, so the 32 bytes returned equal what
   * `getClientExtensionResults().prf.results.first` holds for the same
   * credential and salt.
   */
  salt: BufferInput;
  pin?: string;
}

export type Status = 'touch' | 'processing';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBytes(input: BufferInput): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function encode(input: BufferInput): string {
  const bytes = toBytes(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(chunk >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[chunk & 63];
  }
  return out;
}

function decode(text: string): Uint8Array {
  const values = Array.from(text, char => ALPHABET.indexOf(char));
  const out = new Uint8Array(Math.floor((values.length * 6) / 8));
  let bits = 0;
  let accumulator = 0;
  let index = 0;
  for (const value of values) {
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (accumulator >> bits) & 255;
    }
  }
  return out;
}

/** Whether a security key is plugged in (or the software authenticator is installed). */
export function isAvailable(): Promise<boolean> {
  return NativeWebauthn.isAvailable();
}

/**
 * Creates a resident credential on a security key with the PRF extension and
 * the user verified by PIN, as `navigator.credentials.create` does in the web
 * app. The key waits for a touch; listen with {@link onStatus} to tell the user.
 */
export async function register(options: RegisterOptions): Promise<Registered> {
  const result = await NativeWebauthn.register({
    rpId: options.rpId,
    rpName: options.rpName,
    userId: encode(options.userId),
    userName: options.userName,
    displayName: options.displayName ?? options.userName,
    pin: options.pin ?? null,
  });
  return {
    credentialId: decode(result.credentialId),
    transports: result.transports,
    prfEnabled: result.prfEnabled,
  };
}

/** Evaluates the PRF of a credential: 32 bytes, the same for the same salt. */
export async function getPrf(options: PrfOptions): Promise<Uint8Array> {
  const secret = await NativeWebauthn.getPrf({
    rpId: options.rpId,
    credentialId: encode(options.credentialId),
    salt: encode(options.salt),
    pin: options.pin ?? null,
  });
  return decode(secret);
}

/** Calls `listener` while a key works: `touch` when the user has to touch it. */
export function onStatus(listener: (status: Status) => void): {
  remove(): void;
} {
  const subscription = NativeWebauthn.onStatus(event =>
    listener(event.state as Status),
  );
  return { remove: () => subscription.remove() };
}

/**
 * Replaces USB with an authenticator that runs in the app, for tests that have
 * no key to plug in. It exists in debug builds only (or with the
 * `soft-authenticator` feature of the crate); a release build rejects with
 * `ERR_UNSUPPORTED`. Its credentials last until {@link removeSoftAuthenticator}
 * or the app quits.
 */
export function installSoftAuthenticator(pin: string): Promise<void> {
  return NativeWebauthn.installSoftAuthenticator(pin);
}

export function removeSoftAuthenticator(): Promise<void> {
  return NativeWebauthn.removeSoftAuthenticator();
}

export default {
  isAvailable,
  register,
  getPrf,
  onStatus,
  installSoftAuthenticator,
  removeSoftAuthenticator,
};
