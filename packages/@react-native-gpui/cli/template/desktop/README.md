# Desktop (GPUI)

This is the app-local GPUI target. Its `Cargo.toml` depends on the shared runtime crate; `src/main.rs` is the app's launch point, so you can add Rust modules and local crate dependencies without editing the platform package. iOS, Android, and desktop share the JavaScript entry point and JS dependencies.

Run the desktop app from the project root with:

```sh
npx react-native run-desktop
```

The Metro config, Rust app crate, generated bundle, Cargo build output, and autolinking cache are kept in this directory.

## Window configuration

`src/main.rs` uses `DesktopAppConfig` to set the title and initial size. It can
also set an initial position, configure public GPUI `WindowOptions`, install
GPUI app services before launch, and access the live `gpui::Window` after it
opens. Window size and position restore from the previous run by default; call
`.restore_window_state(false)` to always use the configured initial geometry.

## Project-local Rust TurboModules

Declare local Rust source in `src/main.rs`, annotate its implementation with
`#[rn_gpui::rn_module("NativeGreeting")]`, and keep its generated symbols
linked with
`rn_gpui::register_turbo_module!(greeting::GREETINGMODULE_RN_GPUI_MODULES);`.
Add `src/NativeGreeting.d.ts` with `MODULE_NAME = 'NativeGreeting'`, the
`// rn-gpui:rust-type GreetingModule` annotation, and the supported synchronous
`(string) => string` method signature. `npx react-native run-desktop` discovers
these local specs during its normal autolink step and generates the native
provider automatically. Put Rust implementation dependencies in this folder's
`Cargo.toml`.
