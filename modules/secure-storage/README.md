# @react-native-gpui/secure-storage

Secrets in the operating system's credential store, and strings encrypted with a key kept there, for react-native-gpui apps. The desktop equivalent of Electron's `safeStorage`.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/secure-storage
```

## Usage

```js
import {
  isAvailable,
  setItem,
  getItem,
  deleteItem,
  encryptString,
  decryptString,
} from '@react-native-gpui/secure-storage';

await setItem('com.example.app', 'token', 'secret');
const token = await getItem('com.example.app', 'token');
await deleteItem('com.example.app', 'token');

const data = await encryptString('com.example.app', 'a secret'); // Uint8Array
const text = await decryptString('com.example.app', data);
```

macOS (the login keychain) is tested. Windows (Credential Manager, DPAPI) and Linux (Secret Service) are written but untested.

## Documentation

[Secure storage](https://streetwriters.github.io/react-native-gpui/docs/desktop-secure-storage)

## License

MIT. See [LICENSE](LICENSE).
