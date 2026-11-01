---
id: hermes
title: Using Hermes
---

[Hermes](https://hermesengine.dev) is an open-source JavaScript engine optimized for React Native. For many apps, using Hermes will result in improved start-up time, decreased memory usage, and smaller app size.

On desktop, Hermes is provided by the `@react-native-gpui/hermes` package. New apps include it, so no additional configuration is required to enable it. It is a regular [JavaScript engine package](js-engines), so it is built into your app by autolinking.

## What the package provides

`@react-native-gpui/hermes` packages Hermes pinned to one commit, with the public headers and the prebuilt VM and compiler for every platform and architecture that react-native-gpui supports. It provides:

- the runtime, built with the debugger, so [React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools) can connect;
- bytecode compilation for release builds;
- [Node-API](native-modules-node-addons), for `.node` addons;
- the Metro transform profile that Hermes needs.

## Confirming Hermes is in use

The engine reports its name and version to JavaScript:

```jsx
import { Platform } from 'react-native';

console.log(Platform.constants.jsEngine); // {name: 'hermes', version: '…'}
```

A `HermesInternal` global variable is also available in JavaScript that can be used to verify that Hermes is in use:

```jsx
const isHermes = () => !!global.HermesInternal;
```

## Bytecode in release builds

A debug build loads plain JavaScript from Metro. A release build compiles the JavaScript to Hermes bytecode at build time, which improves your app's startup speed. Try it by making a release build:

```shell
npx react-native run-desktop --release
```

`package-desktop` ships the same bytecode in your installers. The bundle is staged as `index.bundle`, and the packaging step checks that it starts with the Hermes bytecode header.

## Switching to another engine

An app can use any engine that is available as a package. See [JavaScript engines](js-engines) for how an engine is chosen, and how to write one.
