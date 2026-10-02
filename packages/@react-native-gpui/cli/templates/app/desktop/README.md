# Desktop (GPUI)

This is the app-local GPUI target. Its `Cargo.toml` depends on the `react-native-gpui` Rust crate; `src/main.rs` is the app's launch point, so you can add Rust modules and local crate dependencies without editing the platform package. iOS, Android, and desktop share the JavaScript entry point and JS dependencies.

Run the desktop app from the project root with:

```sh
npx react-native run-desktop
```

The default starts or reuses Metro on port 8081 and runs a debug Cargo build,
so Fast Refresh and LogBox work. Change the Metro port with `--port 8082`.
Use `--release` to bundle JavaScript and run the optimized, Metro-free build.

The Metro config, Rust app crate, generated bundle, Cargo build output, and autolinking cache are kept in this directory.

## Window configuration

`src/main.rs` uses `DesktopAppConfig` to set the title and initial size. It can
also set an initial position, configure public GPUI `WindowOptions`, install
GPUI app services before launch, and access the live `gpui::Window` after it
opens. Window size and position restore from the previous run by default; call
`.restore_window_state(false)` to always use the configured initial geometry.

## Project-local Rust TurboModules

Declare local Rust source in `src/main.rs`, annotate its `NativeGreeting`
implementation with `#[react_native_gpui::rn_module("NativeGreeting")]`, and
keep its generated symbols linked with
`react_native_gpui::register_turbo_module!(greeting::NATIVEGREETING_RN_GPUI_MODULES);`.
Add `src/NativeGreeting.ts` with a
`TurboModuleRegistry.getEnforcing<Spec>('NativeGreeting')` spec and the
supported synchronous `(string) => string` method signature.
`npx react-native run-desktop` discovers
these local specs during its normal autolink step and generates the native
provider automatically. Put Rust implementation dependencies in this folder's
`Cargo.toml`.
