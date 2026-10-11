# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui):
one GPU-accelerated Rust renderer for **macOS, Windows and Linux**.

- An out-of-tree React Native platform, like react-native-windows, built on `react-native@0.87.1`.
- Fabric (C++) lays out with Yoga; GPUI paints and owns the event loop.
- `Platform.OS` is `'gpui'`; `Platform.hostOS` is `'macos'`, `'windows'` or `'linux'`.

## Requirements

- Node.js 22.13 or newer
- Rust (stable) with cargo
- CMake and Ninja
- A C++20 compiler: Xcode command line tools on macOS, Visual Studio 2022
  Build Tools (MSVC) on Windows, GCC or Clang on Linux

### Linux

The Rust crates probe GTK 3 and AppIndicator through `pkg-config` at build
time, and the tray icon loads `libayatana-appindicator3` at run time. Install
your distribution's development packages for them:

| Distribution  | Command                                                          |
| ------------- | ---------------------------------------------------------------- |
| Debian/Ubuntu | `sudo apt install libgtk-3-dev libayatana-appindicator3-dev`     |
| Fedora        | `sudo dnf install gtk3-devel libayatana-appindicator-gtk3-devel` |
| Arch          | `sudo pacman -S gtk3 libayatana-appindicator`                    |

If a non-system `pkg-config` is first on `PATH` (Linuxbrew and Nix do this), it
hides the system libraries and the C++ build fails with confusing errors. Point
`PKG_CONFIG_PATH` at your system `pkgconfig` directories, for example:

```sh
export PKG_CONFIG_PATH="$(/usr/bin/pkg-config --variable pc_path pkg-config)"
```

`run-desktop` checks both modules up front and says what to install. Its message
uses the path its own `/usr/bin/pkg-config` reports, so it names a path that is
correct on your machine rather than a hard-coded one.

At run time Hermes resolves the system ICU (`libicuuc`/`libicui18n`, any
version) with `dlopen`. Without any ICU the VM still runs, with ASCII-only
case mapping, code-unit collation and no-op normalization.

## Create an app

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
npx react-native run-desktop
```

This creates a standard React Native project with `ios/` and `android/`, plus a
`desktop/` GPUI target. All three use the same app entry and dependencies, so
`npx react-native run-ios` and `npx react-native run-android` work as usual.

To add GPUI to an existing React Native project, run `npx react-native init-desktop`.

## Native modules

Create a TurboModule package in Rust or C++:

```sh
npx react-native create-library mmkv              # Rust
npx react-native create-library mmkv --type cpp   # C++
```

Both templates use React Native's `TurboModuleRegistry` API and TypeScript specs.

### C++ TurboModules

A C++ package declares a `codegenConfig` whose `name` is a C++ identifier and a
`platforms.gpui.cppProvider` in its `react-native.config.js`. Autolinking runs
React Native Codegen over the package's specs and writes two headers:
`<codegenConfig.name>JSI.h` (React Native's own, for the struct helpers of named
object types) and `<codegenConfig.name>.h`, which declares one spec class per
spec file: `src/NativeGreeting.ts` defines `NativeGreetingSpec`. The
implementation derives from that class and declares one method per spec method:

```cpp
#include <GPUIGreetingSpec.h>

class GreetingModule final : public NativeGreetingSpec<GreetingModule> {
 public:
  explicit GreetingModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeGreetingSpec(std::move(jsInvoker)) {}

  // A value method runs on the JS thread and takes the runtime first.
  std::string greet(jsi::Runtime&, std::string name);

  // A void or Promise method runs on the module's own thread.
  void load(std::string uri, rngpui::Promise<bool> promise);
  void record(std::string value);

  // A callback may be called from any thread, at most once.
  void lookup(std::string key, rngpui::Callback<std::string, bool> callback);
};
```

Arguments arrive as the C++ type the spec maps to (`std::string`, `double`,
`bool`, `std::optional<T>`, `std::vector<T>`, `std::vector<uint8_t>` for an
`ArrayBuffer`, `folly::dynamic` for an untyped object, `rngpui::Callback<...>`
for a function), and `rngpui::Promise<T>` replaces a spec `Promise<T>`
(`Promise<void>` becomes `rngpui::Promise<>`). An `ArrayBuffer` is copied into
bytes the module owns, so a method may keep them or run on any thread. A
method that does not run on the JS thread cannot
take a JSI type; that is a compile error. `promise.resolve(value)`,
`promise.reject(message)` and `promise.reject(code, message)` may be called from
any thread, and only the first call has an effect.

A `public static constexpr rngpui::ModuleThread kThread` picks the thread a
module's `void` and `Promise` methods run on: `Own` (the default) is a serial
queue with its own thread, `Main` is the GPUI main thread, and `JS` runs them
inline on the JS thread, where they take `jsi::Runtime&` first like value
methods. It has to be public: the generated spec class reads `T::kThread`.

Typed events come from the spec as well. `readonly onProgress:
CodegenTypes.EventEmitter<number>` generates a protected `emitOnProgress(value)`
that may be called from any thread; `addListener`/`removeListeners` methods and
`sendEvent("name", folly::dynamic)` cover modules used through
`NativeEventEmitter`.

The provider returns a new instance for its own module name and `nullptr`
otherwise, which `rngpui::provideTurboModule` in `GpuiTurboModule.h` does from
`Module::kModuleName`.

### Rust TurboModules

A Rust package declares `platforms.gpui.crate` in its `react-native.config.js`
and depends on `rn-gpui-module`, with `rn-gpui-module-build` as a build
dependency. `gpui/build.rs` lists the package's specs:

```rust
fn main() {
    rn_gpui_module_build::generate(&["../src/NativeGreeting.ts"]);
}
```

The generator writes a trait per spec file into the crate's `OUT_DIR`;
`gpui/src/lib.rs` includes it and implements the trait. The author writes no
argument checks, no promise plumbing and no C++:

```rust
rn_gpui_module::include_specs!();

pub struct Greeting;

impl NativeGreetingSpec for Greeting {
    fn new(events: NativeGreetingEvents) -> Self {
        Self { events }
    }

    // A value method runs on the JS thread.
    fn greet(&self, name: String) -> Result<String, ModuleError> {
        Ok(format!("Hello from Rust, {name}!"))
    }

    // A void or Promise method runs on the module's own thread, or the GPUI
    // main thread with `const THREAD: ModuleThread = ModuleThread::Main;`.
    async fn load(&self, uri: String) -> Result<bool, ModuleError> {
        Ok(true)
    }
    fn record(&self, value: String) {}

    // A callback is consumed by calling it, so it can be called at most once.
    // It may also be dropped instead, which releases the JS function.
    fn lookup(&self, key: String, callback: Box<dyn FnOnce(String, bool) + Send>) {
        callback(key, true);
    }

    // An ArrayBuffer arrives as bytes the module owns.
    fn checksum(&self, data: ArrayBuffer) -> Result<f64, ModuleError> {
        Ok(data.iter().map(|byte| f64::from(*byte)).sum())
    }

    // Typed spec events go through the generated handle.
    fn start(&self, steps: f64) {
        self.events.on_progress(steps);
        self.events.send_event("tick", Value::Null);
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_greeting_module::<Greeting>());
}
```

`spec` types map to Rust types: `string` to `String`, `number` to `f64`,
`Int32` to `i32`, `boolean` to `bool`, `?T` to `Option<T>`, `Array<T>` to
`Vec<T>`, `ArrayBuffer` to `rn_gpui_module::ArrayBuffer`, `Object` to
`rn_gpui_module::Value`, a named object alias or an inline object to a generated
struct, a string literal union or TS `enum` to a generated enum, and `Promise<T>`
to an `async fn` returning `Result<T, ModuleError>`. An `ArrayBuffer` arrives as
its bytes, so the method owns them.
Values cross the bridge structurally, never as text. A mistake against the spec
fails the library crate's own build.

The app calls each crate's `rn_gpui_register()` from the autolink shim, so
nothing has to be kept alive by hand.

### Fabric components

A native package that provides Fabric components declares their descriptors
and headers in the GPUI entry of its `react-native.config.js`:

```js
gpui: {
  cmake: 'gpui',
  componentDescriptors: ['RNCSafeAreaViewComponentDescriptor'],
  componentHeaders: [
    'react/renderer/components/safeareacontext/ComponentDescriptors.h',
  ],
}
```

Autolinking registers the descriptors with Fabric and runs React Native Codegen
for dependencies whose `codegenConfig.type` is `components` or `all`.
Handwritten sources and include directories go in `componentSources` and
`componentIncludeDirs`. Missing or duplicate descriptors are reported during
autolinking or at startup.

### Node-API addons

A stock `.node` file from npm loads unchanged. There is no shim package to
install and nothing to rebuild: the Babel plugin rewrites the `require` at
bundle time to a path the runtime can open, and the JS engine's own Node-API
implementation loads it.

Add the plugin to `babel.config.js`:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['module:react-native-gpui/babel-plugin-node-addons'],
};
```

It is a no-op unless Metro is building the `gpui` platform, so the same config
stays valid for iOS and Android.

Then require the addon as its own documentation says to:

```js
const crc32 = require('@node-rs/crc32').crc32('hello');
```

#### Which `require` forms are recognised

Most packages do not write `require('./addon.node')` themselves. They ship a
loader that picks the binary at run time from `process.platform`, `fs` and
`path` — none of which exist in Hermes. The plugin does that selection at build
time instead. On desktop the build machine _is_ the target, so it can ask the
real loader.

| Form in package code                                                     | What the plugin does                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require('./build/addon.node')`                                          | Resolves the file relative to the requiring module.                                                                                                                                                                  |
| `require('./addon')` (no extension, and `<dir>/addon.node` exists)       | Uses the `.node` file, but only when no `.js`, `.cjs`, `.mjs`, `.json`, `.ts` or `.tsx` file of that name and no directory of that name exists, so a real module is never shadowed.                                  |
| A bare package whose entry is a `.node` file                             | Uses that file.                                                                                                                                                                                                      |
| `require('node-gyp-build')(__dirname)` (also `path.join`/`path.resolve`) | Runs `node-gyp-build`'s own resolver against the host, so `prebuilds/<platform>-<arch>/` layouts, `glibc`/`musl` tags, `node.napi` files and in-tree `build/Release` builds all resolve the way the package intends. |
| `require('bindings')('<name>')`                                          | Searches the directories `bindings` itself searches from the package root.                                                                                                                                           |
| A napi-rs generated loader                                               | Recognises the generated file and replaces the whole module with the one binary this host needs.                                                                                                                     |
| ``require(`./build/addon-${platform}.node`)``                            | Collects the files matching the static prefix and suffix and keeps the one for this host.                                                                                                                            |

A missing file is not a build error. The plugin emits an expression that throws
`Cannot find module '…'` with `code: 'MODULE_NOT_FOUND'` when evaluated, because
packages list a binary per platform and wrap each in `try`/`catch` — the ones
for other platforms _must_ fail at run time, not at bundle time.

The plugin is where the platform decision is made, so `process.platform` and
`process.arch` are still not available in the runtime.

#### Only pure Node-API addons

An addon that calls `libuv` (`uv_*`), V8 or NAN fails to load, because there is
no Node.js runtime behind it. Loading such an addon throws an `Error` naming the
missing symbol from `dlerror()`:

```
Failed to load '/…/addon.node': undefined symbol: uv_default_loop
```

Check a binary before depending on it:

```sh
nm -D --undefined-only addon.node | grep -E " (uv_|_ZN2v8|_ZN4node)"   # must print nothing
```

#### How the file is found

At run time `_requireNodeLibrary(key, path)` resolves `key` to a file. The first
existing regular file wins:

1. each directory in `RN_GPUI_NODE_ADDON_PATH` (colon-separated on macOS and
   Linux, semicolon-separated on Windows), joined with `key`;
2. `<directory of the executable>/node-addons/<key>`;
3. macOS only: `<directory of the executable>/../Resources/node-addons/<key>`;
4. the absolute path baked into the bundle by a development build.

If nothing exists, the thrown `Error` lists `key` and every location tried, and
has `code: 'MODULE_NOT_FOUND'`. Exports are cached per JS runtime, so a reload
initialises the addon again, as a new Node context would.

`key` is the addon's path from the **first** `node_modules/` onward, so two
versions of one package get different keys. A file outside `node_modules` gets
`local/<8 hex chars of sha1(absolute path)>/<basename>`.

A development build uses the embedded absolute path and needs nothing else. A
packaged app ships the files next to its executable, which is what
`collect-node-addons` prepares:

```sh
npx react-native-gpui collect-node-addons \
  --bundle desktop/build/index.bundle --out dist/MyApp.app/Contents/Resources/node-addons
```

It scans the bundle for the addon paths, copies each to `<out>/<key>`, copies
the sibling shared libraries (`*.so*`, `*.dylib`, `*.dll`) those addons may load
through `$ORIGIN` / `@loader_path`, prints what it copied, and fails if a baked-in
path no longer exists.

#### macOS distribution

A notarised app with the hardened runtime refuses to load a library signed by
someone else unless the app has the
`com.apple.security.cs.disable-library-validation` entitlement or the addon is
re-signed with the app's identity. Shipping an addon therefore means re-signing
it as part of packaging.

#### Windows

Not yet verified. Windows has no global symbol lookup: a `.node` file records
each Node-API import as a function name _plus the file it must come from_, and an
addon built for Node records "from `node.exe`". Node-API addons instead look the
functions up in the **host process's executable**, so the app's `.exe` has to
re-export Hermes's Node-API functions. `node-gyp` addons reach the same place
through a delay-load hook; an addon built without that hook cannot load. Treat
Windows support as untested until someone runs it.

## JavaScript engine

React Native GPUI has no built-in JS engine. An engine is an ordinary installed
package that autolinks like any other native library, so installing one is how
you opt in. `@react-native-gpui/hermes` is the default in new apps; a QuickJS,
JavaScriptCore or V8 package registers the same way without changes to core.

### Choosing an engine

| Where                                                            | Effect                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `RN_GPUI_JS_ENGINE=<name>`                                       | Run this engine for one launch; overrides the app's choice |
| `DesktopAppConfig::js_engine("<name>")` in `desktop/src/main.rs` | The app's choice                                           |
| the installed set                                                | With one engine installed it is the default                |

With several engines installed and none chosen, startup fails with a message
listing them. There is no `app.json` key for this.

```ts
import { Platform } from 'react-native';

console.log(Platform.constants.jsEngine); // {name: 'hermes', version: '10a40b5…'}
```

`name` is the engine package's `jsEngine.name`; `version` is whatever the engine
reports (Hermes reports the pinned `facebook/hermes` commit).

### Writing an engine package

The contract is `ReactGpui/rn-gpui-sys/cpp/GpuiJsEngine.h` in
`react-native-gpui`. An engine package declares itself in its
`react-native.config.js` GPUI entry:

```js
gpui: {
  cmake: 'gpui',
  jsEngine: {
    name: 'hermes',
    register: 'rn_gpui_register_js_engine_hermes', // C symbol, called at startup
    bundle: './gpui/bundle.js',                   // optional JS tooling hooks
    runtimeFiles: './gpui/runtime-files.js',      // optional shared libraries to ship
  },
}
```

Its `gpui/CMakeLists.txt` adds whatever the engine needs and tells core about it
through global properties: `RN_GPUI_JS_ENGINE_SUBDIRECTORIES`,
`RN_GPUI_JS_ENGINE_SOURCES`, `RN_GPUI_JS_ENGINE_INCLUDE_DIRS`,
`RN_GPUI_JS_ENGINE_DEFINITIONS` and `RN_GPUI_JS_ENGINE_DEPS`.

The registration function calls `rngpui::registerJsEngine` with the engine's
info, a required `makeRuntimeFactory`, and optionally a `nodeAddons` capability.
`@react-native-gpui/hermes/gpui` is a worked example.

`GpuiJsEngine` is a struct of capabilities rather than a base class, so an engine
provides only what it can and core has no built-in engine to fall back on. The
optional `nodeAddons` capability is a `makeLoader` factory returning a function
that loads one absolute `.node` path into the runtime; core owns the
`_requireNodeLibrary` global, path resolution, the cache and the error messages,
and never includes an engine's headers. An engine that omits `nodeAddons` still
gets the global — it fails with a message naming the engine, so app code does not
have to feature-detect.

`bundle.js` may export any of:

- `metroConfig(config)` — Metro changes the engine needs, e.g. Hermes'
  `transformer.unstable_transformProfile = 'hermes-stable'`.
- `compile({input, output, sourcemapInput, sourcemapOutput, dev})` — turn a
  bundle into the engine's shipping format (`hermesc -emit-binary` for Hermes).
  Without it, release builds ship the plain JS bundle.
- `bundleExtension` — the file name the runtime loads, e.g. `'.hbc'`.

A prebuilt runtime does not yet compile an engine's glue per app; use a source
build until that lands.

## Desktop shell

`react-native-gpui/desktop` is the desktop shell: the application menu bar,
native context menus, windows and title bars, the Dev Menu and the Perf Monitor.
Everything is optional; an app that imports none of it behaves as before.

```ts
import {
  ApplicationMenu,
  Menu,
  ContextMenu,
  ContextMenuView,
  PerfMonitor,
  DesktopWindow,
  TitleBar,
  useDesktopWindow,
} from 'react-native-gpui/desktop';
```

### Application menu (7.1)

```tsx
<ApplicationMenu
  items={[
    { type: 'standard', role: 'appMenu' },
    { type: 'standard', role: 'editMenu' },
    {
      type: 'submenu',
      label: 'View',
      items: [
        { id: 'reload', label: 'Reload', accelerator: 'secondary-r' },
        { type: 'separator' },
        { id: 'zoom', label: 'Actual size', checked: true },
      ],
    },
    { type: 'standard', role: 'windowMenu' },
  ]}
  onPress={({ nativeEvent }) => console.log(nativeEvent.id)}
/>
```

Standard roles map to the platform's own menus (`about`, `hide`, `quit`,
`undo`/`redo`/`cut`/`copy`/`paste`/`selectAll`, `minimize`, `zoom`,
`toggleFullscreen`, `close`). Item presses arrive as `gpuiDesktop:menuPress`
events and through `onPress`. Accelerators accept `secondary` (Command on
macOS, Control elsewhere) and `mod`/`cmd`/`ctrl`/`alt`/`shift`. The imperative
`Menu.setApplicationMenu(items)` / `Menu.getApplicationMenu()` pair is available
for apps that already build their own UI.

### Menu bar on Linux

Linux has no menu bar GPUI can drive (`muda` needs a GTK window), so
`react-native-gpui` draws one in the window: the titles sit in a strip at the
top, and each menu opens as a GPUI popup. The surface is laid out below the
strip, so the bar never covers the app.

`RN_GPUI_MENU_BAR=gpui` forces the GPUI bar on a platform that also has a native
one (useful for testing); `=native` forces it off. The default is Linux only.

### Context menus (7.2)

A `View` with `onContextMenu` reports the press in window points and the window
id, so a menu can be shown for a window that is not the platform's active one:

```tsx
<ContextMenuView
  items={[
    { id: 'open', label: 'Open' },
    {
      type: 'submenu',
      label: 'More',
      items: [{ id: 'nested', label: 'Nested' }],
    },
    { type: 'separator' },
    { id: 'pin', label: 'Pinned', checked: true },
  ]}
  onPress={id => console.log(id)}
>
  <Text>Right-click me</Text>
</ContextMenuView>
```

`ContextMenu.show(items, {x, y, windowId})` resolves with the chosen item id, or
`null` when the menu is dismissed. A secondary click on macOS includes
Control+click.

`@react-native-menu/menu` consumers can keep their imports by mapping the package
name to the bundled polyfill:

```js
// metro.config.js
resolver: {
  extraNodeModules: {
    '@react-native-menu/menu': require.resolve('react-native-gpui/polyfills/menu'),
  },
}
```

It supports `actions` (`subactions`, `state: 'on'`, `attributes.disabled`,
`attributes.hidden`), `onPressAction` and `shouldOpenOnLongPress`. Icons and
`themeVariant` are ignored.

### Windows and title bars (7.4)

```tsx
const window = useDesktopWindow(); // or DesktopWindow.current()

await window.setTitle('Editor');
await window.setSize(1200, 800);
await window.minimize();
await window.toggleFullscreen();
await DesktopWindow.open('Settings', { width: 480, height: 320 });
```

`window.setCloseVetoHandler(handler)` lets a window refuse to close (a 3 second
guard prevents an app that never answers from trapping the user). Focus, blur,
resize, move and close-requested events arrive as `gpuiDesktop:*` device events.

For a fully custom title bar, launch the window with
`DesktopAppConfig::window_title_bar(WindowTitleBar::Transparent { traffic_lights })`
and mark drag areas with the `desktopDragRegion` View prop, or render
`<TitleBar>` and use `desktopWindowControl` for the buttons.

### Dev Menu (7.5)

Cmd/Ctrl+D, or the Developer group in the Help menu, opens a native popup with
Reload, Open DevTools, Toggle Element Inspector, Toggle Perf Monitor and Fast
Refresh. It is available in debug builds, or when the app asks for it:

```rust
DesktopAppConfig::from_env().dev_menu(true)
```

The `DevMenu` TurboModule (`show`, `reload`, `setProfilingEnabled`,
`setHotLoadingEnabled`) and `DevSettings`'s `setProfilingEnabled`,
`setHotLoadingEnabled` and `toggleElementInspector` are wired to the same
handlers. Note that React Native's `DevSettings` JS module is a no-op outside
`__DEV__`.

### Launch configuration from `app.json`

`npx react-native init-desktop` reads the `desktop` key and writes it into
`desktop/src/main.rs`:

```json
{
  "name": "Demo",
  "desktop": {
    "appId": "com.example.demo",
    "window": {
      "title": "Demo",
      "width": 1280,
      "height": 800,
      "position": { "x": 40, "y": 60 },
      "restoreState": false,
      "resizable": false
    },
    "devMenu": false,
    "tray": { "component": "MenuBarPanel", "tooltip": "Demo" }
  }
}
```

Without those keys the template's own `main.rs` is kept. Invalid values are
rejected with the `app.json` path in the message.

### Tray / menu-bar apps (7.3)

```ts
await Tray.install({
  component: 'MenuBarPanel', // the RN surface the popover runs
  tooltip: 'My app',
  menu: [{ id: 'quit', label: 'Quit' }],
});
const stop = Tray.onMenuPress(id => console.log(id));
```

Or from Rust:

```rust
DesktopAppConfig::from_env()
    .tray(TrayConfig::default().component("MenuBarPanel").tooltip("My app"))
```

A tray app runs with no Dock icon (`NSApplicationActivationPolicyAccessory`) and
keeps running when its last window closes; `TrayConfig` sets both by default. A
click opens the popover under the icon, and it hides when it loses activation the
way a native popover does.

Platform caveats: Windows has no anchored popover, and on GNOME a Linux
AppIndicator only supports menus, not click-to-popover, so a menu is the only
reliable interaction there.

### Perf Monitor (7.6)

```ts
await PerfMonitor.setEnabled(true);
const metrics = await PerfMonitor.getMetrics();
// { enabled, uiFps, jsFps, memoryBytes, mountedViews, lastMountMs }
```

The overlay is drawn by GPUI above every surface, so it does not disturb what it
measures. While it is visible the app never goes idle, which matters for tests
that wait for idle.

### Platform support

| Feature                    | macOS                        | Windows                             | Linux                                       |
| -------------------------- | ---------------------------- | ----------------------------------- | ------------------------------------------- |
| Application menu           | GPUI `NSMenu`                | `muda` on the HWND (unverified)     | GPUI-rendered in-window bar                 |
| Context menus              | `muda` on the `NSView`       | `muda` on the HWND (unverified)     | GPUI-rendered popup                         |
| Window positioning / raise | AppKit                       | `SetWindowPos` (unverified)         | X11 only; Wayland says `unsupported`        |
| Custom title bar           | AppKit                       | `desktopWindowControl` (unverified) | not implemented                             |
| Tray apps (7.3)            | yes                          | yes (no anchored popover)           | yes (menu-only on GNOME)                    |
| Dev Menu                   | yes                          | menu popup as above                 | popup as above                              |
| Perf Monitor               | yes (memory via `task_info`) | counters yes, memory `n/a`          | counters yes, memory via `/proc/self/statm` |
| Window capture (tests)     | yes                          | yes (unverified)                    | yes, X11 tested; Wayland untested           |
| Hidden (`show: false`)     | yes                          | unverified                          | yes (X11 stays unmapped until shown)        |
| Native accessibility tree  | AppKit probe                 | AccessKit/UIA (unverified)          | AccessKit via AT-SPI; tests enable the bus  |
| Node-API addons            | stock `.node` from npm       | not implemented (Part W deferred)   | stock `.node` from npm                      |

"Unverified" means the code is behind `cfg` and has never been compiled, because
this machine cannot build for that platform.

`react-native-gpui/desktop` reports what the current platform supports through
`capabilities()`, which reads the `GpuiDesktop` TurboModule synchronously, so an
app can degrade gracefully instead of calling into an unsupported path. Every
desktop-shell command is a method of that module, with the arguments and results
the JS API uses; `rn-gpui` implements the trait generated from its spec, so the
two sides cannot drift, and each command runs on the GPUI main thread.

## Testing a desktop app

```sh
npm run test:e2e                     # the tester's whole suite
npm run test:e2e -- desktop-shell    # one file
```

The suite launches real app processes against a Metro server on port 8082, so
it needs an **unlocked** macOS session: a locked session has no displays, GPUI
waits for one before entering AppKit, and every test would time out. The runner
checks for that up front and says so; `RN_GPUI_ALLOW_LOCKED_SCREEN=1` skips the
check. Restart Metro after changing `metro.config.js` or `package.json`.

On Linux the runner turns on the session's AT-SPI flag
(`org.a11y.Status.IsEnabled` on `org.a11y.Bus`) for the duration of the run and
restores the previous value afterwards, so the native accessibility assertions
have a tree to read. With no AT-SPI session bus those tests skip.

## Supported libraries

| Package                                | Adds GPUI support for            |
| -------------------------------------- | -------------------------------- |
| `@react-native-gpui/reanimated`        | `react-native-reanimated` 4      |
| `@react-native-gpui/worklets`          | `react-native-worklets`          |
| `@react-native-gpui/gesture-handler`   | `react-native-gesture-handler`   |
| `@react-native-gpui/screens`           | `react-native-screens`           |
| `@react-native-gpui/safe-area-context` | `react-native-safe-area-context` |
| `@react-native-gpui/svg`               | `react-native-svg`               |
| `@react-native-gpui/fonts`             | Custom font loading              |
| `@react-native-gpui/vector-icons`      | Vector icon rasterization        |
| `@react-native-gpui/hermes`            | The Hermes JS engine             |
| `@react-native-gpui/testing`           | Desktop test presets and driver  |

## Prebuilt C++ runtime

Most of a clean build is spent compiling the React Native C++ runtime and its
native dependencies. When a prebuilt runtime is published for your platform, the
build downloads it once, verifies it and caches it. Otherwise it builds the
runtime from source.

Environment variables:

| Variable                                                | Effect                                           |
| ------------------------------------------------------- | ------------------------------------------------ |
| `RN_GPUI_BUILD_FROM_SOURCE=1`                           | Always build the runtime from source             |
| `RN_GPUI_REQUIRE_PREBUILT=1`                            | Fail instead of falling back to a source build   |
| `RN_GPUI_PREBUILT_DIR=<dir>`                            | Use an already unpacked runtime; no download     |
| `RN_GPUI_PREBUILT_CACHE=<dir>`                          | Cache location (default: the OS cache directory) |
| `RN_GPUI_PREBUILT_OFFLINE=1` / `CARGO_NET_OFFLINE=true` | Use the cache only                               |

## License

[MIT](LICENSE)
