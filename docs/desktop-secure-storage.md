---
id: desktop-secure-storage
title: Secure storage
---

`@react-native-gpui/secure-storage` keeps small secrets in the operating system's credential store and encrypts strings with a key that never leaves it. It is the desktop equivalent of Electron's `safeStorage`.

```shell
npm install @react-native-gpui/secure-storage
```

## Items

```js
import {
  isAvailable,
  setItem,
  getItem,
  deleteItem,
} from '@react-native-gpui/secure-storage';

if (await isAvailable()) {
  await setItem('com.example.app', 'token', 'secret');
  const token = await getItem('com.example.app', 'token'); // 'secret', or null
  await deleteItem('com.example.app', 'token'); // true when there was one
}
```

An item is addressed by `service` (any name you choose, such as `session`) and `key`. `setItem` replaces an earlier value. `isAvailable()` only reads (a missing probe item counts as available), so it never writes and does not make the system ask for access; it is `false` when the store is locked away or missing (for example a Linux session without a Secret Service).

Every item belongs to the app. The credential store service is built natively as `<bundle identifier>/<service>` (outside a bundle, such as in development, the executable's name replaces the bundle identifier), so JavaScript cannot name another app's service, and another rn-gpui app using the same `service` and `key` gets a different item. A `service` that is empty or contains `/` or a control character is rejected. Items are stored with the key prefixed, which keeps `getItem`, `setItem` and `deleteItem` away from the encryption key.

## Encrypting strings

```js
import {
  encryptString,
  decryptString,
} from '@react-native-gpui/secure-storage';

const data = await encryptString('com.example.app', 'a secret'); // Uint8Array
const text = await decryptString('com.example.app', data);
```

`encryptString` uses AES-256-GCM with a random nonce. The 32-byte key is created on first use and stored in the credential store for that `service` of the app; it is never returned to JavaScript. The result is one version byte, the 12-byte nonce, the ciphertext and the tag, so you can store it in a file or a database. `decryptString` rejects when the data was changed, was made for another service, or the key was removed from the store.

If the user or the system deletes the key, data encrypted with it cannot be read again, as with Electron.

## Platforms

- macOS: the login keychain, through the Security framework. Tested.
- Windows: Credential Manager, whose secrets are protected with DPAPI. Written but not tested.
- Linux: the Secret Service (GNOME Keyring, KWallet) through D-Bus. Written but not tested; building needs the libdbus development package.

Values in Credential Manager are limited to about 2.5 KB; the encryption key is far below that, but keep stored values small. Nothing is read from or written to disk by this module itself.
