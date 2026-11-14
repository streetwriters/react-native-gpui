---
id: build-speed
title: Speeding up your Build phase
---

Building a desktop app compiles Rust, and C++ for the parts of React Native that are not prebuilt. The first build takes a few minutes, and later builds are incremental. This page shares some suggestions on how to **improve your build time**.

:::info

Some of these suggestions are advanced and require some understanding of how Cargo and CMake work.

:::

## Use the prebuilt runtime

React Native's C++ runtime is the largest part of a build. By default (`prebuilt: 'auto'`), the first build downloads a prebuilt copy for your platform and React Native version, so only your own desktop app is compiled. Check that it is used:

- A build that compiles the runtime means no prebuilt matched. Update to a version of `@react-native-gpui/core` that has one for your platform.
- Set `prebuilt: 'always'` in `react-native.config.js` so that the build fails when the prebuilt cannot be used, instead of silently compiling the runtime.
- On a CI machine, cache the download folder between runs. See [Prebuilt runtime](cli#prebuilt-runtime) for its location and for `RN_GPUI_PREBUILT_CACHE`.
- The sources of the C++ libraries (Boost, folly, curl...) and the OpenSSL a source build compiles are kept in one [native dependency cache](cli#native-dependency-cache) shared by all your projects and checkouts, so only the first build on a machine downloads them. Cache that folder on CI too.

## Keep the Cargo target folder

Cargo builds incrementally into `desktop/build/target`. Do not delete it between builds, and on CI, cache it.

Cargo never removes old build outputs by itself, so the folder grows. The CLI keeps it in check: before a build it removes outputs that no recent build has used. They are removed after seven days by default.

| Variable                     | Description                                                  |
| ---------------------------- | ------------------------------------------------------------ |
| `RN_GPUI_TARGET_GC=0`        | Turns the clean-up off.                                      |
| `RN_GPUI_TARGET_GC_DAYS=<n>` | How many days an unused build output is kept. Defaults to 7. |

The clean-up never runs when the `CI` variable is set.

## Keep debug information small

Debug builds are built with line tables only, which is enough for stack traces and most debugging. Full debug information makes the build slower and larger. Ask for it only when you attach a native debugger:

```shell
CARGO_PROFILE_DEV_DEBUG=full npx react-native run-desktop
```

## Dependencies are optimized in debug builds

The project's `Cargo.toml` compiles dependencies with optimizations even in debug builds, because the renderer rebuilds and paints the element tree on every frame. They are compiled once, and then reused. Only your own crate is compiled without optimizations. If you add a dependency that is slow to compile, expect a slower first build and fast builds after that.

## Release builds are slower on purpose

`run-desktop --release` and `package-desktop` build with full link-time optimization, which trades about 1.4 times the build time for a smaller binary. Use debug builds while you develop, and release builds when you measure performance or package the app.

## Build only the features you need

`--features` selects the Cargo features of the desktop app. A smaller feature set compiles less code:

```shell
npx react-native run-desktop --features my-feature
```

## Use a faster linker

On Linux, linking a large Rust binary is often the slowest step of an incremental build. Using a faster linker such as `lld` or `mold` helps. Configure it in `desktop/.cargo/config.toml`, as in the [Cargo documentation](https://doc.rust-lang.org/cargo/reference/config.html).

On macOS and Windows the default linkers are usually fast enough.
