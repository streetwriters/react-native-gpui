# Desktop (GPUI)

This is the app-local GPUI target. Its `Cargo.toml` depends on the `react-native-gpui` Rust crate; `src/main.rs` is the app's launch point, so you can add Rust modules and local crate dependencies without editing the platform package. iOS, Android, and desktop share the JavaScript entry point and JS dependencies. The build script reads the app name and `desktop.appId` from the project-root `app.json`.

Run the desktop app from the project root with:

```sh
npx react-native run-desktop
```

The default starts or reuses Metro on port 8081 and runs a debug Cargo build,
so Fast Refresh and LogBox work. Change the Metro port with `--port 8082`.
Use `--release` to bundle JavaScript and run the optimized, Metro-free build.

`npx react-native init-desktop` installs dependencies, autolinks native modules, and creates `build/index.bundle`; that bundle lets `cargo run` launch the latest initialized app without the CLI. For development with Fast Refresh, LogBox, and a live Metro server, use `npx react-native run-desktop`.

Autolink output is generated under `desktop/autolink/` and gitignored. It is
recreated by `init-desktop` and each `run-desktop`; do not commit those generated
files. Cargo build output and bundles are also kept under `desktop/build/`.

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

For a reusable TurboModule library, keep its TypeScript spec under `src/` and
its native implementation under `gpui/`, with `codegenConfig` and
`platforms.gpui` in `package.json`; `npx react-native create-library` creates
that layout. `desktop/Info.plist` and `desktop/assets/` are the app-bundle
metadata and icon slots used by Phase 5 packaging. Add the app icon as
`desktop/assets/AppIcon.icns`.
