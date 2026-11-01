---
id: security
title: Security
---

React Native's [security guide](https://reactnative.dev/docs/0.87/security) applies to desktop apps. This page lists what is different on desktop.

## Secure storage

Each desktop operating system has a credential store: the **Keychain** on macOS, the **Credential Manager** on Windows, and the **Secret Service** (GNOME Keyring or KWallet) on Linux. They store small secrets such as tokens and passwords, encrypted and tied to the user's login. Async Storage is not encrypted, so keep secrets out of it.

react-native-gpui does not include a library for the credential stores yet. To use them, write a [native module](native-modules-rust) on top of a Rust crate that wraps all three, such as [`keyring`](https://crates.io/crates/keyring), or [port](porting-libraries) a library to desktop.

## URL schemes

A desktop app registers its schemes through `urlSchemes` in `desktop.json` (see [Linking](linking#deep-links)). Any app on the machine can register the same scheme or open yours, so never send sensitive information in a URL, and treat incoming URLs as untrusted input.
