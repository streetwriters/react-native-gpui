---
id: upgrading
title: Upgrading
---

react-native-gpui tracks one React Native version at a time. Each release of `@react-native-gpui/core` targets one exact version of `react-native`, and a desktop app uses that version.

## Versions

| Package                         | Follows                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `@react-native-gpui/core`       | An exact `react-native` version, such as `0.87.1`.       |
| `@react-native-gpui/*` adapters | The upstream library's version series, such as `5.10.x`. |
| `@react-native-gpui/hermes`     | One pinned Hermes commit.                                |

The documentation is versioned the same way. See the [versions page](/versions).

## Upgrading your app

1. Bump `react-native`, `@react-native-gpui/core` and the other `@react-native-gpui/*` packages together, to versions that agree.
2. Install, and run `npx react-native run-desktop`. Autolinking regenerates `desktop/autolink/`.
3. Fix compile errors in your own Rust or C++ native code, if any. They are most likely in code that touches Fabric directly.
4. Re-run your end-to-end tests. See [Testing](desktop-testing).

The first build after an upgrade downloads the prebuilt runtime for the new version. If no prebuilt exists for it yet, the build compiles the runtime from source. See [Prebuilt runtime](cli#prebuilt-runtime).

For changes to React Native itself, use the [React Native Upgrade Helper](https://react-native-community.github.io/upgrade-helper/) for the JavaScript parts of your app.

## How the platform upgrades

For each React Native release, the platform is upgraded in these steps:

1. Bump the pinned `react-native` version.
2. Merge upstream changes into the files the platform overrides, with an override tool, and refresh the vendored copies.
3. Validate the override manifest in CI, so that no unrecorded or stale override lands.
4. Rebuild, and fix the Rust host where React Native's C++ interfaces changed. The mounting manager, the scheduler delegate and the text layout manager are the ones to watch.
5. Run the end-to-end suite on all three operating systems.
