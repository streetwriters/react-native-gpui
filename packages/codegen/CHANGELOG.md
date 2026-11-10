# Changelog

All notable changes to `@react-native-gpui/codegen` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- An event payload field named `value` or `emitter` no longer breaks the generated C++ with a redefinition error: the shim's parameters carry a `p_` prefix and the payload local is `rn_payload`.
- The generated host component context has `app()`, which returns the GPUI `App` of the call the component was made in.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- Generates Rust and C++ specs for Turbo Native Modules and host components, plugged into `@react-native/codegen`.
