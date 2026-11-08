# @react-native-gpui/webauthn

FIDO2 security keys for react-native-gpui apps: create a resident credential with the user verified by PIN, and derive a secret from it with the PRF (hmac-secret) extension. It speaks CTAP2 to keys plugged in over USB, which is what a browser's WebAuthn does for the same calls.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/webauthn
```

## Usage

```js
import { register, getPrf, onStatus } from '@react-native-gpui/webauthn';

const touch = onStatus(state => state === 'touch' && showTouchPrompt());
const { credentialId, prfEnabled } = await register({
  rpId: 'app.notesnook.com',
  rpName: 'Notesnook',
  userId,
  userName,
  pin,
});
const secret = await getPrf({
  rpId: 'app.notesnook.com',
  credentialId,
  salt,
  pin,
});
touch.remove();
```

`secret` is 32 bytes and equals `getClientExtensionResults().prf.results.first` of a browser for the same credential, relying party and salt.

Errors carry a `code`: `ERR_WEBAUTHN_NO_DEVICE`, `_PIN_REQUIRED`, `_PIN_INVALID` (the message says how many tries are left), `_PIN_BLOCKED`, `_PIN_NOT_SET`, `_NO_CREDENTIALS`, `_TIMEOUT`, `_CANCELLED`, `_UNSUPPORTED`.

## Status

Verified against a software CTAP2 authenticator that runs in the crate's tests and in the test app: resident credential creation, PIN protocol 1, getAssertion and the hmac-secret secret derived twice from one credential. **Talking to a real key over USB HID has not been verified: it needs a FIDO2 key with hmac-secret and a PIN set.** The framing is unit tested; the device I/O is not.

- USB keys only. There is no NFC or Bluetooth, and no macOS system sheet.
- The key needs a PIN, the hmac-secret extension and resident key support. Setting a PIN is left to the operating system or the key's own tool.
- Windows blocks raw HID access to FIDO keys for ordinary programs, so it needs the system's `webauthn.dll` instead of this transport. Not done.
- `installSoftAuthenticator` exists in builds with debug assertions only (or the `soft-authenticator` crate feature) and rejects with `ERR_UNSUPPORTED` in a release build.

## License

MIT. See [LICENSE](LICENSE).
