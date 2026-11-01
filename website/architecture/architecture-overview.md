---
id: architecture-overview
title: Architecture Overview
slug: /overview
---

Architecture Overview is intended to share a conceptual overview of how react-native-gpui and React Native's internals work. The intended audience includes library authors and core contributors. If you are an app developer, it is not a requirement to be familiar with this material to be effective with React Native. You can still benefit from the overview as it will give you insights into how React Native works under the hood.

react-native-gpui is a React Native platform for macOS, Windows and Linux. It keeps React Native's shared C++ core, and replaces the native view layer with one renderer, [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui). GPUI is the GPU-accelerated Rust UI framework behind the Zed editor, and it already abstracts windows, input, text shaping and drawing on all three operating systems.

## The layers

```
┌──────────────────────────────────────────────────────────────┐
│ Your app: JavaScript (React, react-native, *.desktop.js)     │
├──────────────────────────────────────────────────────────────┤
│ JavaScript engine + JSI · TurboModules (Rust, C++)           │  JS thread
│ Fabric: UIManager → shadow tree → Yoga → mounting transaction│
├────────────────────── FFI (cxx) ─────────────────────────────┤
│ Rust host                                                    │
│   mounting manager → retained view store (tag → node)        │  UI thread
│   root view → one GPUI element per node                      │  (GPUI main)
│   events: GPUI input → hit test → Fabric event emitter       │
│   text, image and font services                              │
├──────────────────────────────────────────────────────────────┤
│ GPUI: Metal │ DirectX │ Vulkan                               │
└──────────────────────────────────────────────────────────────┘
```

Everything above the line labelled FFI is React Native's own C++ code, so layout, the component tree, TurboModules and the event system behave as on every other platform. Everything below it is Rust.

## From React to pixels

1. React renders, and Fabric builds a **shadow tree** and lays it out with **Yoga**, as on iOS and Android.
2. Fabric hands each change to the host as a **mounting transaction**: create, update, insert and remove views.
3. The Rust host applies the transaction to a **retained view store**, a map from React's view tag to a node that holds its props, style and children. Unchanged nodes are kept between frames.
4. GPUI renders the store. A custom GPUI element paints each node, using shared text, image and font services, so that measuring and painting agree.
5. Input flows the other way. GPUI delivers pointer and keyboard events, the host finds the target by hit testing, and sends the event to Fabric's event emitter, which calls your handlers.

## Threads

| Thread            | Runs                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| JavaScript thread | The JavaScript engine, React, Fabric's shadow tree, and the methods of native modules that return values.                 |
| UI thread         | The GPUI main thread: the event loop, painting, and the mounting of views.                                                |
| Module threads    | Each native module's `void` and `Promise` methods run on a thread of its own, unless the module asks for the main thread. |

Rust owns the process entry point, and GPUI owns the main thread. A module that needs to touch windows or UI asks for the main thread. See [Rust modules](/docs/native-modules-rust#methods-and-threads).

## An out-of-tree platform

react-native-gpui is a separate package, modelled on react-native-windows. It does not fork React Native. It depends on a pinned React Native version and builds only the shared C++ core, Yoga and the JavaScript engine, together with its own renderer. The mobile code stays in `node_modules` and is never compiled.

- **Metro** resolves `*.desktop.js` files first, then `*.native.js`, then plain files, so a library can ship a desktop implementation of a module.
- **Overrides.** Places where the platform needs a different implementation of React Native's own files are recorded in a manifest, so they are reviewable and upgradable. See [Upgrading](/docs/upgrading).
- **Apps stay shared.** Because the real `react-native` is still the dependency, one codebase can ship mobile with React Native and desktop with react-native-gpui.

## Native extensibility

The platform has the same extension points as React Native, in Rust and C++:

- [Native modules](/docs/turbo-native-modules) are TurboModules, generated from TypeScript specifications.
- [Host components](/docs/fabric-native-components) are Fabric components whose content is a GPUI view.
- [Native views](/docs/native-views) embed a view of the operating system.
- [JavaScript engines](/docs/js-engines) are packages that register themselves.
- [Autolinking](/docs/autolinking) connects all of them to the app at build time.

## Table of Contents

- Rendering
  - [Fabric](fabric-renderer)
  - [Render, Commit, and Mount](render-pipeline)
  - [Cross Platform Implementation](xplat-implementation)
  - [View Flattening](view-flattening)
  - [Threading Model](threading-model)
- [Glossary](glossary)
