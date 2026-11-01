---
id: porting-libraries
title: Port an existing library
---

Most React Native apps depend on libraries that have native code for iOS and Android. To use such a library on desktop, you supply its **desktop native side** while keeping the library's own JavaScript. Apps keep importing the original package, and need few or no `Platform.OS` branches.

This is how the `@react-native-gpui/*` packages work. For example, `@react-native-gpui/safe-area-context` is not a copy of `react-native-safe-area-context`: it contains only the desktop implementation, and depends on the original.

## The adapter package

An adapter is a small package named `@react-native-gpui/<name>`. It lists the upstream library and the version range it supports as a peer dependency:

```json title="package.json"
{
  "name": "@react-native-gpui/safe-area-context",
  "peerDependencies": {
    "react-native": "0.87.1",
    "react-native-safe-area-context": "5.10.x"
  },
  "codegenConfig": {
    "name": "GPUISafeAreaContextSpec",
    "type": "modules",
    "jsSrcsDir": "src"
  }
}
```

Its `react-native.config.js` declares the desktop implementation, and tells autolinking how to reuse the upstream library's code:

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        cmake: 'desktop',
        cppProvider: 'create_gpui_safe_area_context_module',
        componentCodegenPackage: 'react-native-safe-area-context',
        componentDescriptors: [
          'RNCSafeAreaProviderComponentDescriptor',
          'RNCSafeAreaViewComponentDescriptor',
        ],
        componentHeaders: [
          'react/renderer/components/safeareacontext/ComponentDescriptors.h',
        ],
      },
    },
  },
};
```

The keys that make this work:

| Key                                        | Purpose                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `componentCodegenPackage`                  | Runs Codegen on the **upstream** package's component specifications, so the adapter does not copy them. |
| `componentSourcePackage`                   | Compiles the upstream package's shared C++ sources, such as shadow nodes.                               |
| `componentDescriptors`, `componentHeaders` | Registers the Fabric component descriptors the upstream library defines.                                |
| `componentSources`, `componentIncludeDirs` | Extra C++ sources and include folders, relative to the source package.                                  |
| `sourceOverrides`                          | Replaces files of the installed JavaScript package for desktop only. See below.                         |

### Replacing a file of the upstream package

When a library's JavaScript must differ on desktop, `sourceOverrides` maps a file of the installed package to a file in the adapter. Metro uses the replacement for the desktop platform only:

```js
sourceOverrides: {
  'react-native-screens/src/core.ts': './src/core.desktop.ts',
},
```

Use this sparingly. Every replaced file has to be reviewed when the upstream library changes.

## Steps to port a library

1. **Read the library's native surface.** List its TurboModules and the host components its JavaScript renders.
2. **Create the adapter package** with the peer dependency on the upstream version, pinned to a minor series such as `5.10.x`.
3. **Implement the native modules** in [Rust](native-modules-rust) or [C++](the-new-architecture/pure-cxx-modules), under the same module names and methods the library's JavaScript calls.
4. **Implement the components** as [host components](fabric-native-components), or reuse the upstream C++ shadow nodes with `componentSourcePackage`.
5. **Methods without a desktop meaning** reject with a clear "not supported on desktop" error, instead of doing nothing silently.
6. **Test** by running the library's own examples in an app on all three desktop platforms.

Some features belong to the desktop shell itself and not to a mobile library: window and application-level behavior comes from [`@react-native-gpui/core/desktop`](desktop-windows). A port should not re-implement them.

## Supported libraries

The packages that already exist are listed in [Supported libraries](supported-libraries).
