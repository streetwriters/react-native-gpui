---
id: desktop-project
title: The desktop project
---

A desktop app is a normal React Native app with an extra folder, `desktop/`. This page explains what is in it, what is generated, and what you own.

```
MyApp/
├── App.tsx                      # shared by every platform
├── app.json
├── babel.config.js
├── react-native-gpui-env.d.ts   # TypeScript types for the desktop props
└── desktop/
    ├── Cargo.toml               # the Rust crate of the app
    ├── build.rs
    ├── desktop.json             # name, icon, window, packaging
    ├── metro.config.js
    ├── src/main.rs              # the launch point
    ├── assets/icon.png
    ├── e2e/app.e2e.ts           # an end-to-end test
    ├── autolink/                # generated, git-ignored
    └── build/                   # build output, git-ignored
```

The JavaScript entry point and its dependencies are shared with iOS and Android. `desktop/` only adds the desktop target.

## main.rs

`desktop/src/main.rs` is the launch point of the app. It is yours, so you can add Rust modules and crate dependencies without touching the platform package.

```rust title="desktop/src/main.rs"
rn_gpui_module::include_specs!();

fn main() {
    let config = react_native_gpui::DesktopAppConfig::from_env_with_defaults(
        env!("RN_GPUI_APP_NAME"),
        env!("RN_GPUI_APP_ID"),
    )
    .window_title(env!("RN_GPUI_APP_NAME"))
    .window_size(1024.0, 768.0);

    react_native_gpui::run_with(config);
}
```

`DesktopAppConfig` configures the app before it starts:

| Method                             | Description                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `window_title(title)`              | The main window's title.                                                       |
| `window_size(width, height)`       | The initial size, in points.                                                   |
| `window_position(x, y)`            | A fixed initial position.                                                      |
| `restore_window_state(bool)`       | Whether size and position are restored from the previous run. On by default.   |
| `title_bar(WindowTitleBar)`        | The [title bar](desktop-title-bar) style.                                      |
| `traffic_light_position(x, y)`     | Where the macOS traffic lights sit.                                            |
| `menu_bar(bool)`                   | Whether the in-window menu bar is shown.                                       |
| `quit_on_last_window_closed(bool)` | Whether the app quits when its last window closes.                             |
| `tray(TrayConfig)`                 | A [tray](desktop-tray) icon.                                                   |
| `dev_menu(bool)`                   | Whether the [dev menu](debugging) is available. On in debug builds by default. |
| `js_engine(name)`                  | The [JavaScript engine](js-engines) to use when several are installed.         |
| `configure_window(callback)`       | Changes GPUI's public `WindowOptions` before the window opens.                 |
| `on_app_ready(callback)`           | Runs with the GPUI `App` once it is ready, to install your own services.       |
| `on_window_opened(callback)`       | Runs with the live window after it opens.                                      |
| `gpui_first(callback)`             | Builds the window from your own GPUI view. See [Embedding](embedding).         |

Most of these are also available without code through [`desktop.json`](desktop-json). Use `main.rs` for what the file cannot express.

### App-local modules

Rust [native modules](native-modules-rust) that belong to the app are registered in `main`, before `run_with`:

```rust
react_native_gpui::register_module(native_greeting_module::<Greeting>());
```

Their specifications are listed in `desktop/build.rs`:

```rust
rn_gpui_module_build::generate(&["src/NativeGreeting.ts"]);
```

## build.rs

`build.rs` reads the app's name from `app.json` and its identifier from `desktop.json`, and passes them to the crate as `RN_GPUI_APP_NAME` and `RN_GPUI_APP_ID`. It also generates the code for app-local modules, and arranges the shared libraries of the runtime, such as the JavaScript engine, so that the app finds them.

Two things in it matter if you edit it:

- `rn_gpui_module_build::forward_node_api_exports()` re-exports the engine's Node-API names from the executable, which lets Node addons load on Windows. Keep it if you use [Node addons](native-modules-node-addons).
- A debug build records where its bundle is. A release build does not, because the path would name the machine that built it. A packaged app finds its bundle next to its executable.

## Cargo.toml

The scaffold writes build settings suited to the app:

- dependencies are optimized even in a debug build, because GPUI rebuilds and paints the element tree each frame, and they are compiled only once;
- release builds use full link-time optimization;
- the dependencies you add are listed in `[dependencies]`.

Autolinking adds a `[patch.crates-io]` table to this file. It is regenerated on every run, so do not edit it.

## Generated files

| Folder              | Contents                                                               | Commit it? |
| ------------------- | ---------------------------------------------------------------------- | ---------- |
| `desktop/autolink/` | Autolinking output, created by `init-desktop` and every `run-desktop`. | No         |
| `desktop/build/`    | Cargo output, bundles and packages.                                    | No         |

`desktop/.gitignore` already lists both.

## TypeScript

`react-native-gpui-env.d.ts` in the project root references the types that add the desktop props to `View`, such as `desktopDragRegion` and `onContextMenu`. It is regenerated, and is what makes those props type-check without importing anything.
