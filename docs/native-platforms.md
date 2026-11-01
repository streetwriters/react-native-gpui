---
id: native-platform
title: Native Platform
---

Your app may need features of the operating system that React Native and the community libraries do not provide: a file dialog, the system keychain, a Rust crate, a C++ library you already have. React Native for desktop connects native code to your JavaScript with the same building blocks as React Native, and adds Rust as the default language.

This section introduces:

- **Native modules:** native code with no user interface, such as storage, networking or an operating-system service. JavaScript calls them as functions and objects.
- **Native components:** native views that React renders. Either a view drawn with GPUI (a _host component_), or a view that belongs to the operating system itself (a _native view_).

## Choosing how to write native code

| You have                                                     | Use                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| New code that calls the operating system                     | A [Rust module](native-modules-rust). It is the default for new desktop code, with the Rust ecosystem's crates for most operating-system APIs. |
| Existing C++ code, or C++ shared with iOS and Android        | A [C++ module](the-new-architecture/pure-cxx-modules).                                                                                         |
| An npm package that already ships a `.node` binary           | A [Node addon](native-modules-node-addons), which loads unchanged.                                                                             |
| A React Native library that already supports iOS and Android | [Port the library](porting-libraries) to desktop by supplying its native side.                                                                 |
| A custom view drawn by GPUI                                  | A [host component](fabric-native-components).                                                                                                  |
| A view from AppKit, Win32 or X11                             | A [native view](native-views).                                                                                                                 |

## Where to start

1. Native modules
   - [Introduction](turbo-native-modules): the spec, Codegen and the implementation, in Rust or C++.
   - [Rust modules](native-modules-rust): types, threads, errors and events.
   - [C++ modules](the-new-architecture/pure-cxx-modules)
   - [Node addons](native-modules-node-addons)
2. Native components
   - [Host components](fabric-native-components)
   - [Native views](native-views)
3. Libraries
   - [Create a library](the-new-architecture/create-module-library)
   - [Port an existing library](porting-libraries)
4. The platform
   - [Codegen](the-new-architecture/what-is-codegen)
   - [Autolinking](autolinking)
   - [The desktop project](desktop-project)
   - [JavaScript engines](js-engines)
   - [Embedding React Native in a GPUI app](embedding)

:::note
Native modules and components use React Native's new architecture: TurboModules and Fabric. The legacy native module and component APIs of React Native are not available on desktop.
:::
