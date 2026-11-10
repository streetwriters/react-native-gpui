# Changelog

All notable changes to `@react-native-gpui/codegen` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- A component spec whose props are strings, numbers, booleans, enums, colors, `UnsafeMixed` values or arrays of numbers is also a component of a native tree: the generated props view reads either the C++ props or the JSON props of a native tree instance through the same accessors, the change mask can be built from prop names, events are sent to a native tree as `{ nativeEvent }` payloads, commands are called by name with JSON arguments, and the context has `children()`. The same `impl <Spec>Spec for T` serves both; register it for a native tree with `<Spec>Component::<T>::register_native_tree()`. Specs with other prop shapes (images, structs, arrays of structs) stay Fabric-only and panic if one of their accessors is read in a native tree. Existing implementations compile unchanged.

- The generated host component trait has an optional `measure(props, constraint)` for `measured` components.
- An event payload field named `value` or `emitter` no longer breaks the generated C++ with a redefinition error: the shim's parameters carry a `p_` prefix and the payload local is `rn_payload`.
- The generated host component context has `window()` and `with_window()`.
- The generated host component context has `app()`, which returns the GPUI `App` of the call the component was made in.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- Generates Rust and C++ specs for Turbo Native Modules and host components, plugged into `@react-native/codegen`.
