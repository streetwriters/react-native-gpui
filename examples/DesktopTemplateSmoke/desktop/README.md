# Desktop (GPUI)

This is the app-local GPUI target. Its `Cargo.toml` depends on the shared runtime crate; `src/main.rs` is the app's launch point, so you can add Rust modules and local crate dependencies without editing the platform package. iOS, Android, and desktop share the JavaScript entry point and JS dependencies.

Run the desktop app from the project root with:

```sh
npx react-native run-desktop
```

The build script reads the app name and `desktop.appId` from the project-root
`app.json`. `Cargo.lock` is committed so this smoke app stays reproducible
against the dependency set used by template and runtime checks.

Autolink output is generated under `desktop/autolink/` and gitignored. It is
recreated by `init-desktop` and `run-desktop`; do not commit those generated files.
Cargo build output and bundles are kept under `desktop/build/`.
`Cargo.lock` is committed so this smoke app stays reproducible against the
dependency set used by template and runtime checks.

The starter app depends on the Rust and C++ fixtures under `tester/`. Normal
React Native autolinking discovers both packages and compiles them into the
app-owned native module archive; the app calls the C++ module through its
package entry point.

## AppKit native views

On macOS, a library can render an `NSView` inside the Fabric tree with
`react-native-gpui/NativeViewHost`. Register its matching Rust factory from
`DesktopAppConfig::on_app_ready` in `desktop/src/main.rs`; the factory receives
the JSON `nativeProps` object and returns one owned `NSView` reference through
`NativeViewHandle::from_owned_nsview`. GPUI attaches and resizes the view to the
Yoga bounds and releases it when Fabric unmounts the host. The React Native
overlay host (LogBox and modal surfaces) is deferred above native surfaces. The
ordinary Fabric tree stays in GPUI's base scene, so place native content where
it does not cover sibling content; use a React Native modal for an overlay above
the hosted AppKit view.

The smoke app registers `BlueNativeProbe` and renders it from `App.tsx`. This
initial API is AppKit-specific; Windows and Linux native view factories are not
implemented yet.
