# Changelog

All notable changes to `@react-native-gpui/secure-storage` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version.
- `setItem`, `getItem` and `deleteItem` keep a string in the operating system's credential store under a service and a key, and `isAvailable` tells whether the store works.
- `encryptString` and `decryptString` use AES-256-GCM with a key that is created on first use and kept in the credential store for the service.
- Tested on macOS (login keychain). The Windows (Credential Manager) and Linux (Secret Service) paths are written but untested.
