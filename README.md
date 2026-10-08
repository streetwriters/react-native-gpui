# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) —
one GPU-accelerated Rust renderer for **macOS, Windows and Linux**.

- Out-of-tree platform package (react-native-windows model) pinned to `react-native@0.87.1`
- Rust owns the process entry; GPUI owns the main thread and event loop
- Fabric (C++) does layout via Yoga; a custom `gpui::Element` paints via GPUI
- `Platform.OS === 'gpui'`, `Platform.hostOS` is `'macos' | 'windows' | 'linux'`

See `.local/react-native-gpui.md` for the full design doc.

## Toolchain (verified on the dev machine, TODO 0.4)

| Tool         | Version            |
| ------------ | ------------------ |
| macOS        | Darwin (Apple)     |
| Node.js      | v22.20.0           |
| npm          | (bundled)          |
| Rust / cargo | 1.96.0             |
| CMake        | 3.31.4             |
| Ninja        | 1.12.1             |
| clang        | Apple clang 21.0.0 |

## Create an app

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
npx react-native run-desktop
```

The initializer creates a standard React Native project with `ios/` and
`android/` directories, then adds a `desktop/` GPUI target. All three platforms
use the same React Native app entry and dependencies. Use `npx react-native run-ios` and `npx react-native run-android` for the standard mobile workflows.

GPUI runs its own Hermes build, pinned to one `facebook/hermes` commit and
shipped as the `@react-native-gpui/hermes` workspace package: the headers are
committed there, and the VM and `hermesc` binaries are built for every platform
by the `hermes-engine` workflow. Install them with
`npm run fetch-binaries --workspace @react-native-gpui/hermes`.

To add GPUI support to an existing React Native project, run
`npx react-native init-desktop`. Create a native TurboModule package with
`npx react-native create-library mmkv` (Rust) or
`npx react-native create-library mmkv --type cpp` (C++). Both templates use
React Native's `TurboModuleRegistry` API and TypeScript specs.

## Prebuilt C++ runtime

`rn-gpui-sys` needs the ReactCommon runtime, Hermes glue and the native
dependencies (folly, boost, openssl and others). Building them takes most of a
clean desktop build, so the runtime is also published as a prebuilt archive per
platform.

- **Apps.** When a prebuilt archive is published for the app's platform, the
  build downloads it once, verifies it, and caches it. Otherwise the build falls
  back to building the runtime from source and prints one `cargo:warning`.
- **Inside this repository** the build builds from source unless
  `RN_GPUI_USE_PREBUILT=1` is set.
- **Build environment variables** (read by `rn-gpui-sys/build.rs`, checked in
  this order):
  - `RN_GPUI_BUILD_FROM_SOURCE=1`: always build from source.
  - `RN_GPUI_PREBUILT_DIR=<dir>`: use an unpacked prebuilt directory; no download.
  - `RN_GPUI_USE_PREBUILT=1`: allow the prebuilt download inside this repository.
  - `RN_GPUI_REQUIRE_PREBUILT=1`: fail the build instead of falling back to source.
- **Download environment variables** (read by `scripts/prebuilt-binaries.mjs`):
  - `RN_GPUI_PREBUILT_CACHE=<dir>`: cache root (default: the OS cache directory,
    `react-native-gpui/prebuilt/<version>/<platform>`).
  - `RN_GPUI_PREBUILT_OFFLINE=1` or `CARGO_NET_OFFLINE=true`: use the cache only,
    no network.
  - `GITHUB_TOKEN` or `GH_TOKEN`: optional, sent with GitHub release downloads.

The pin file `packages/react-native-gpui/prebuilt-binaries.json` names the
release and each platform's file, SHA-256 and size. An empty `assets` map means
no runtime is published yet, so apps build from source.

The CLI manages the cache:

```sh
npx react-native-gpui prebuilt fetch [--triple <rust-triple>]   # download or reuse; prints the dir
npx react-native-gpui prebuilt path [--triple <rust-triple>]    # print the cache dir, no download
npx react-native-gpui prebuilt verify <dir>                     # check every file against manifest.json
npx react-native-gpui prebuilt clean                            # remove this version's cache
```

### Toolchain of published archives

| Platform     | Rust triple               | Built with                                          | Minimum OS / glibc | C++ stdlib | C++ standard | CRT                      |
| ------------ | ------------------------- | --------------------------------------------------- | ------------------ | ---------- | ------------ | ------------------------ |
| darwin-arm64 | aarch64-apple-darwin      | Apple clang (macos-14 runner)                       | macOS 11.0         | libc++     | C++20        | n/a                      |
| darwin-x64   | x86_64-apple-darwin       | Apple clang (macos-15-intel runner)                 | macOS 11.0         | libc++     | C++20        | n/a                      |
| win32-x64    | x86_64-pc-windows-msvc    | MSVC from VS 2022 (windows-2022)                    | not recorded       | MSVC STL   | C++20        | `/MD` (MultiThreadedDLL) |
| linux-x64    | x86_64-unknown-linux-gnu  | GCC on Debian 12 container                          | glibc 2.36         | libstdc++  | C++20        | n/a                      |
| win32-arm64  | aarch64-pc-windows-msvc   | MSVC from VS 2022 ARM64 tools (windows-11-arm)      | not recorded       | MSVC STL   | C++20        | `/MD` (MultiThreadedDLL) |
| linux-arm64  | aarch64-unknown-linux-gnu | GCC on Debian 12 arm64 container (ubuntu-24.04-arm) | glibc 2.36         | libstdc++  | C++20        | n/a                      |

The exact compiler version of each archive is recorded in its `manifest.json`
(`compiler`, `cxxStdlib`, `minOs`, `glibc`, `msvcRuntime`).

### For maintainers

- **Release workflow.** `.github/workflows/prebuilt-binaries.yml` runs on push to
  `main` when a C++ input changes (the input-hash paths) and on
  `workflow_dispatch` (`force` builds even when the pin matches). Pull requests
  build and check the archives but never publish. The `plan` job computes the
  input hash with `scripts/prebuilt-inputs.mjs` and skips the build when it
  matches the pin. Otherwise the version is a patch bump, or a minor bump when
  the React Native version changes. The `release` job creates a draft release
  `@react-native-gpui/prebuilt-binaries@<version>`, uploads the archives and
  `SHA256SUMS.txt`, publishes it, and opens a PR that updates the pin
  (`prebuilt-binaries/<version>` branch). Releases are never deleted.
- **Publish guard.** `npm publish` runs `prepublishOnly`
  (`scripts/check-prebuilt-pin.mjs`), which refuses to publish when the pin's
  `inputHash` is not the current hash or the pin has no assets. Set
  `RN_GPUI_SKIP_PREBUILT_PIN_CHECK=1` only for a deliberate source-only release.
  Do not set it in CI.
- **Build an archive locally.** From the repository root:

  ```sh
  node packages/react-native-gpui/scripts/build-prebuilt.mjs --version <v> --out <dir>
  ```

  Options: `--build-dir <dir>` (scratch build), `--native-deps <dir>` (native
  dependency cache, reused between runs), `--jobs <n>`, `--skip-build`. The
  cxxbridge headers and `FBReactNativeSpec` sources are generated when
  `--bridge` and `--rncore` are omitted, so no tester build is needed. The
  archive is `prebuilt-binaries-<platform>.tar.gz` with a `manifest.json` and
  `.sha256` next to it. It holds `lib/`, `cmake/`, `manifest.json` and only
  OpenSSL's generated headers (`include/openssl-generated`). Every other header
  comes from the consumer's own tree: `node_modules/react-native` (ReactCommon,
  ReactCxxPlatform), the react-native-gpui package (ReactCommonOverrides and the
  rn-gpui-sys headers), `@react-native-gpui/hermes`, the consumer's cxxbridge and
  FBReactNativeSpec output, and the native-deps downloads. The consumer sets
  `RN_GPUI_PREBUILT_ROOT_<name>` for each root before `find_package`; the config
  file fails if one is missing. The manifest lists the native-deps archives with
  sha256 and the react-native version the archive was built against.

## Fabric components in native packages

A native package that provides Fabric components declares their descriptors
and headers in its `react-native.config.js` GPUI platform entry:

```js
gpui: {
  cmake: 'gpui',
  componentDescriptors: ['RNCSafeAreaViewComponentDescriptor'],
  componentHeaders: [
    'react/renderer/components/safeareacontext/ComponentDescriptors.h',
  ],
}
```

Autolinking registers these descriptors with Fabric and runs React Native
Codegen for dependencies whose `codegenConfig.type` is `components` or `all`.
Their generated C++ is kept under `desktop/autolink/codegen/` and compiled into
the app. Handwritten platform sources and include directories can be added as
`componentSources` and `componentIncludeDirs` in the same GPUI config. Missing
or duplicate descriptors are reported during autolinking or app startup.

## Tests

```sh
npm test                              # unit tests (Vitest)
npm run test:e2e                      # bundle, build and run the e2e suite
npm run test:e2e -- --headed          # same, with visible app windows
npm run test:e2e -- --keep-app        # leave the test apps running afterwards
npm run test:e2e -- -u                # refresh screenshot baselines
```

`npm run test:e2e` bundles `packages/rn-gpui-tester`, builds it with the
`test-driver` feature, starts the local network fixture and runs
`vitest.e2e.config.ts`. Test apps are detached processes, so the runner stops
every app it started when the suite finishes; `--keep-app` (or
`RN_GPUI_KEEP_APP=1`) leaves them running instead, which is what you want when
inspecting a failure. Tests launch hidden windows by default — pass `--headed`
(or set `RN_GPUI_TEST_HEADED=1`) to watch them, which also runs a single worker
so only one app window is on screen at a time. For interactive use, run
`npm run desktop`.
