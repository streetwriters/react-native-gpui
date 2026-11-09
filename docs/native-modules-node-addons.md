---
id: native-modules-node-addons
title: 'Native Modules: Node addons'
---

Many npm packages ship a native `.node` file, built with Node-API (`napi`). React Native for desktop loads those files unchanged, so a package such as a checksum or hashing library works without being rebuilt or rewritten.

```js
import { crc32 } from '@node-rs/crc32';

crc32('hello');
```

## How it works

1. When the bundle is built, a Babel plugin rewrites `require('…/addon.node')` into a call that names the addon, either directly or through the loader the package ships.
2. At run time, the call finds the `.node` file and gives it to the JavaScript engine's own Node-API implementation.

Nothing is compiled by your app. The plugin and the loader are part of `@react-native-gpui/core`. A new app's `babel.config.js` already lists the plugin. To use addons in an existing app, add it yourself:

```js title="babel.config.js"
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['module:@react-native-gpui/core/babel-plugin-node-addons'],
};
```

The plugin does nothing for other platforms, so the same configuration still builds for iOS and Android.

## Supported loaders

The plugin understands the common ways packages locate their binary:

- a direct `require('./build/Release/addon.node')`, including inside a `try`/`catch` chain of candidates;
- `require('node-gyp-build')(__dirname)`;
- `require('bindings')('addon')`;
- the generated loaders of napi-rs packages, which choose a file by `process.platform` and architecture.

The plugin removes the loader instead of running it, because most loaders need Node built-in modules such as `fs`, `path` or `child_process` at load time, which the JavaScript engine does not have.

## Limits

- **Pure Node-API only.** An addon that uses `libuv` (`uv_*`), V8 or NAN fails to load, because there is no Node.js underneath.
- **No Node built-in modules.** A package whose entry point needs `fs`, `util` or `stream` at load time cannot be bundled.
- **Built for the host.** The plugin picks the addon for the machine that builds the bundle, so build on the platform you target.
- **Not every loader pattern is recognized.** A loader the plugin does not understand is left alone, and the `require` fails at run time with Metro's own error.
- **macOS signing.** A notarized app with the hardened runtime does not load an addon signed by someone else, unless the addon is re-signed with the app's identity or the app has the `com.apple.security.cs.disable-library-validation` entitlement. Set it in [`bundle.macos.entitlements`](desktop-json#bundlemacos).

## Packaging

`run-desktop --release` and `package-desktop` collect the addons that the release bundle loads on their own, into `desktop/build/node-addons`, and keep the folder name when they ship it: `Resources/node-addons` in a macOS `.app`. A release run puts the folder next to the executable. Each `.node` file keeps its key path, and the shared libraries that sit next to it stay next to it, so an `@loader_path` or `$ORIGIN` lookup finds them. A debug build keeps loading from the path in the bundle and collects nothing. The build fails when a path in the bundle no longer exists.

On macOS the hardened runtime refuses an addon or a library that is not signed. When `APPLE_SIGNING_IDENTITY` is set, the release build signs each collected `.node` and `.dylib` with that identity, the one it signs the app with. Without it nothing is signed. Linux and Windows collect the addons too, and only macOS has been checked in a packaged app so far.

To collect the addons on your own, run:

```shell
npx react-native collect-node-addons --bundle build/index.bundle --out build/node-addons
```

It scans the bundle for the addon loads and copies each `.node` file, and any shared libraries next to it, into the output folder.

On Windows an addon cannot find the engine's Node-API symbols by name from a global scope, so the app's executable re-exports each one, forwarded to the engine's library. This is generated from the engine's export list. See [JavaScript engines](js-engines).

## Engine support

Node-API is a capability of the JavaScript engine. `@react-native-gpui/hermes` provides it. With an engine that does not, loading an addon throws an error that names the engine.
