---
id: autolinking
title: Autolinking
---

Autolinking finds the native code of the packages an app depends on, and builds it into the app. It runs on every `run-desktop` and `init-desktop`, and writes its output to `desktop/autolink/`, which is generated and git-ignored.

A package takes part by declaring `platforms.desktop` in its `react-native.config.js`:

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        crate: 'rn-gpui-awesome-storage',
      },
    },
  },
};
```

## What autolinking does

- Adds each Rust `crate` to the app's `desktop/Cargo.toml` as a dependency, and calls its `rn_gpui_register` function at startup.
- Compiles each `cmake` project and `cppProvider` into the app.
- Runs React Native Codegen over the specifications of every package with a `codegenConfig`, and compiles the generated C++ into the app.
- Generates the Rust and C++ spec glue for modules, and the typed glue for host components.
- Registers Fabric component descriptors and host components.
- Writes a `[patch.crates-io]` table into the app's `desktop/Cargo.toml`, which points core's crates at the copy the app installed and pins GPUI to core's revision. It is regenerated on every run, so leave it alone.
- Records the installed JavaScript engines.

## platforms.desktop

| Key                       | Type       | Description                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crate`                   | `string`   | The name of a Cargo crate in the package's `desktop/` folder (or the package root). It must have an `rn_gpui_register` function.                                                                                                                                                                                                                                                                    |
| `path`                    | `string`   | The folder of the crate, when it is not `desktop/` or the package root.                                                                                                                                                                                                                                                                                                                             |
| `cmake`                   | `string`   | A folder with a `CMakeLists.txt` that adds C++ sources to the app.                                                                                                                                                                                                                                                                                                                                  |
| `cppProvider`             | `string`   | The C++ function that creates a C++ TurboModule for each specification of the package.                                                                                                                                                                                                                                                                                                              |
| `cppSpecs`                | `string[]` | The specification files (such as `NativeCrypto.ts`) the C++ provider serves, in a package that also has a Rust `crate`: the crate gets the others. Without it both get every specification.                                                                                                                                                                                                         |
| `bundleHook`              | `string`   | A module, relative to the package, run by `run-desktop --release` and `package-desktop` after the app's bundle is built. It is called with `{ projectRoot, desktopRoot, bundleDir, entryFile, metroConfig, engine }` and returns the files or folders, as absolute paths, to ship in the app's resource directory. For a library that needs script files of its own, such as one bundle per worker. |
| `cppSources`              | `string[]` | The C++ sources of the module, if they should not be found from `cmake`.                                                                                                                                                                                                                                                                                                                            |
| `specs`                   | `string`   | The folder of the specifications, when `codegenConfig.jsSrcsDir` is not set. Defaults to `src`.                                                                                                                                                                                                                                                                                                     |
| `hostComponents`          | `object[]` | The [host components](fabric-native-components) the package provides: `{name, measured?, nativeSurface?, container?}`.                                                                                                                                                                                                                                                                              |
| `componentDescriptors`    | `string[]` | C++ identifiers of Fabric component descriptors to register.                                                                                                                                                                                                                                                                                                                                        |
| `componentHeaders`        | `string[]` | The headers that declare those descriptors. Required with `componentDescriptors`.                                                                                                                                                                                                                                                                                                                   |
| `componentSources`        | `string[]` | Extra C++ sources for the components.                                                                                                                                                                                                                                                                                                                                                               |
| `componentIncludeDirs`    | `string[]` | Extra include folders for the components.                                                                                                                                                                                                                                                                                                                                                           |
| `componentSourcePackage`  | `string`   | The package that `componentSources` and `componentIncludeDirs` are relative to. Defaults to the package itself.                                                                                                                                                                                                                                                                                     |
| `componentCodegenPackage` | `string`   | The package whose component specifications Codegen runs over. For [adapters](porting-libraries).                                                                                                                                                                                                                                                                                                    |
| `sourceOverrides`         | `object`   | Files of installed JavaScript packages that Metro replaces for desktop.                                                                                                                                                                                                                                                                                                                             |
| `jsEngine`                | `object`   | Declares the package as a [JavaScript engine](js-engines).                                                                                                                                                                                                                                                                                                                                          |

A `hostComponents` entry cannot be both `measured` and a `container`.

## project.desktop

The app's own `react-native.config.js` carries build options under `project.desktop`:

```js title="react-native.config.js"
module.exports = {
  project: {
    desktop: {
      prebuilt: 'auto', // 'auto' | 'always' | 'never'
    },
  },
};
```

`prebuilt` chooses whether React Native's C++ runtime is downloaded or built from source. See [CLI](cli#prebuilt-runtime).

## Errors

Autolinking checks what it reads. A missing or duplicate component descriptor, an invalid crate name, a `jsEngine` entry that points at a file that does not exist, and a `hostComponents` entry that cannot be both measured and a container are all reported while linking, with the name of the package, and not later in the build.
