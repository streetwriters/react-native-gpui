# Changelog

All notable changes to `@react-native-gpui/secure-storage` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version.
- `setItem`, `getItem` and `deleteItem` keep a string in the operating system's credential store under a service and a key, and `isAvailable` tells whether the store works.
- `encryptString` and `decryptString` use AES-256-GCM with a key that is created on first use and kept in the credential store for the service.
- Tested on macOS (login keychain). The Windows (Credential Manager) and Linux (Secret Service) paths are written but untested.
- Items, encryption keys and the availability check are namespaced natively under the app's bundle identifier (the executable's name outside a bundle): the credential store service is `<identity>/<service>`, never the caller's string. A service name with `/`, a control character, or none is rejected. Items are stored under an `item:` prefix, so the encryption key cannot be read or replaced through `getItem` or `setItem`.
- `isAvailable` only reads, so it does not write to the credential store or prompt.
