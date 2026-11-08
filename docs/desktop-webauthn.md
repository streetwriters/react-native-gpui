---
id: desktop-webauthn
title: Security keys
---

`@react-native-gpui/webauthn` creates credentials on FIDO2 security keys and derives secrets from them with the PRF extension, over CTAP2 on USB. It stands in for `navigator.credentials` where the app has no browser.

```shell
npm install @react-native-gpui/webauthn
```

```js
import { register, getPrf, onStatus } from '@react-native-gpui/webauthn';

const { credentialId } = await register({
  rpId,
  rpName: 'App',
  userId,
  userName,
  pin,
});
const secret = await getPrf({ rpId, credentialId, salt, pin });
```

`register` makes a resident credential with the user verified by PIN and the hmac-secret extension, offering ES256 and RS256. `getPrf` returns the 32 bytes a browser reports as `prf.results.first` for the same credential and salt. Use the relying party id the web app uses, so a credential made in one is found by the other.

`onStatus` reports `touch` while the key waits to be touched. Errors have codes starting `ERR_WEBAUTHN_`: no device, PIN required, invalid (with the tries left), blocked or not set, no credentials, timeout, cancelled and unsupported.

## Testing without a key

`installSoftAuthenticator(pin)` replaces USB with an authenticator inside the app that answers the same CTAP2 messages. It exists only in builds with debug assertions, or with the crate's `soft-authenticator` feature, and a release build rejects it with `ERR_UNSUPPORTED`.

## Limits

USB keys only, and the key needs a PIN, hmac-secret and resident key support. Talking to a real key has not been verified. Windows needs the system's `webauthn.dll` for FIDO keys, which this module does not use yet.
