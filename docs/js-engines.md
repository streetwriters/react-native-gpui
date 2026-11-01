---
id: js-engines
title: JavaScript engines
---

React Native for desktop has no built-in JavaScript engine. An engine is an ordinary package that your app installs, and autolinking builds it in. `@react-native-gpui/hermes` is the engine that new apps use, and it is the first of its kind.

## Which engine runs

- An app with one engine package installed uses it.
- With several installed, set the one to use in `main.rs`, with `DesktopAppConfig::js_engine("hermes")`, or at run time with the `RN_GPUI_JS_ENGINE=<name>` environment variable. An unknown name is a startup error that lists the registered engines.
- With none installed, autolinking fails and tells you to add `@react-native-gpui/hermes` or another engine package.

JavaScript can ask which engine it runs on:

```js
import { Platform } from 'react-native';

Platform.constants.jsEngine; // {name: 'hermes', version: '…'}
```

## Hermes

`@react-native-gpui/hermes` packages [Hermes](https://github.com/facebook/hermes), pinned to one commit, with the public headers and the prebuilt VM and `hermesc` compiler for every platform. It provides:

- the runtime, with the debugger;
- bytecode compilation for release builds. A release build ships the JavaScript compiled to Hermes bytecode, so the app starts faster;
- [Node-API](native-modules-node-addons), for `.node` addons;
- the Metro transform profile that Hermes needs.

## Writing an engine package

An engine package declares itself in the `platforms.desktop.jsEngine` entry of its `react-native.config.js`. Core has no engine-specific code, so everything an engine provides is a capability it plugs in.

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        cmake: 'desktop',
        jsEngine: {
          name: 'hermes',
          register: 'rn_gpui_register_js_engine_hermes',
          bundle: './desktop/bundle.js',
          runtimeFiles: './desktop/runtime-files.js',
          nodeApiExports: './desktop/node-api-exports.txt',
          nodeApiLibrary: 'hermesvm',
        },
      },
    },
  },
};
```

| Key              | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| `name`           | A lowercase engine name, such as `hermes`. Required.                                 |
| `register`       | The name of a C function that registers the engine at startup. Required.             |
| `bundle`         | A JavaScript module with the engine's tooling hooks, below.                          |
| `runtimeFiles`   | A module that returns the shared libraries the app must ship next to the executable. |
| `nodeApiExports` | A list of the Node-API names the engine exports. Windows needs it to forward them.   |
| `nodeApiLibrary` | The library those names are forwarded to. Required with `nodeApiExports`.            |

### The native side

The package's C++ registers a `GpuiJsEngine` from the function named by `register`. Only two parts are required:

```cpp
rngpui::GpuiJsEngine engine;
engine.info = {"hermes", "0.x.y"};                    // reported to JavaScript
engine.makeRuntimeFactory = [] { /* return your JSRuntimeFactory */ }; // used for every load and reload
rngpui::registerJsEngine(std::move(engine));
```

Everything else is optional, and core checks before using it:

- `nodeAddons`: a loader that creates a Node-API environment for a runtime and loads an addon file. Without it, loading an addon throws an error that names the engine.
- `makeFeatureFlagsOverrides`: React Native feature flags the engine needs.

The debugger needs no hook of its own: the runtime's `getRuntimeTargetDelegate()` is the debugger integration. An engine without one gets React Native's fallback, where the console and network inspection work but breakpoints do not.

### Tooling hooks

The module named by `bundle` may export:

| Export                                                           | Purpose                                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `metroConfig()`                                                  | The Metro configuration the engine needs. For Hermes: `transformer.unstable_transformProfile = 'hermes-stable'`.            |
| `compile({input, output, sourcemapInput, sourcemapOutput, dev})` | Compiles the bundle into the format the engine ships, and returns `{output}`. Without it, a release ships plain JavaScript. |
| `bundleExtension`                                                | The file extension of the compiled bundle, such as `.hbc`. Defaults to `.js`.                                               |
| `bytecodeMagic`                                                  | The first bytes of the compiled output, as a `Buffer`. `package-desktop` uses it to check that `compile` produced bytecode. |

`package-desktop` always stages the bundle as `index.bundle`, whatever the engine produced. With a `compile` hook and a `bytecodeMagic`, the output is verified, and the error names the engine. With a `compile` hook and no magic, its output is trusted. Without a `compile` hook, the app ships JavaScript.

### Runtime files

`runtimeFiles` is `(platform, arch) => [absolute paths]`. The paths are shared libraries that packaging and the build copy next to the executable, so core does not need to know the names of an engine's libraries.
