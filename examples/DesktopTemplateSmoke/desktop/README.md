# Desktop (GPUI)

This is the app-local GPUI target. Its `Cargo.toml` depends on the shared runtime crate; `src/main.rs` is the app's launch point, so you can add Rust modules and local crate dependencies without editing the platform package. iOS, Android, and desktop share the JavaScript entry point and JS dependencies.

Run the desktop app from the project root with:

```sh
npx react-native run-desktop
```

The Metro config, Rust app crate, generated bundle, Cargo build output, and autolinking cache are kept in this directory.
