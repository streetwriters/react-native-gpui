---
id: cli
title: CLI
---

The desktop commands come from `@react-native-gpui/cli`. Most of them run through the React Native CLI as `npx react-native <command>`, and `npx react-native-gpui <command>` runs the same ones.

## init

Creates a new React Native app with a desktop target.

```shell
npx @react-native-gpui/cli init MyApp
```

The app name must start with a letter and contain letters, digits, `_` or `-`. `--directory <path>` chooses where the app is created, which is a folder named after the app by default.

## doctor-desktop

Checks that the tools needed to build a desktop app are installed: Node.js, Rust, CMake, and the platform's own toolchain (Xcode and the Metal shader compiler on macOS; the MSVC compiler, Strawberry Perl, NASM and long paths on Windows; a C++ compiler, `pkg-config`, Perl and the X keyboard and XCB libraries on Linux). Each problem is printed with its fix, and the command exits with status 1 when there is one.

```shell
npx react-native doctor-desktop
```

Outside a project, run `npx @react-native-gpui/cli doctor`. `npx react-native doctor` also lists the same checks in a **Desktop** section.

## init-desktop

Adds the desktop target to an existing React Native app.

```shell
npx react-native init-desktop
```

| Option                  | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `--project-root <path>` | The React Native project directory.             |
| `--skip-install`        | Write the scaffold without installing packages. |

## run-desktop

Builds the desktop app and runs it, with Metro by default.

```shell
npx react-native run-desktop
npx react-native run-desktop --release
```

| Option                 | Description                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--release`            | Bundles the JavaScript and builds the optimized app.                                                                              |
| `--entry-file <path>`  | The application entry file.                                                                                                       |
| `--port <number>`      | The Metro port. Defaults to `8081`.                                                                                               |
| `--host <host>`        | The Metro host. Defaults to `localhost`.                                                                                          |
| `--config <path>`      | The Metro configuration file.                                                                                                     |
| `--bundle <path>`      | Where to write the bundle.                                                                                                        |
| `--features <list>`    | Comma-separated Cargo features for the desktop app.                                                                               |
| `--no-launch`          | Builds the app without launching it. With `--features test-driver` it also writes the JavaScript bundle the test driver loads.    |
| `--sign-identity <id>` | macOS only. Signs the built binary with this code signing identity (default: `$APPLE_SIGNING_IDENTITY`), also with `--no-launch`. |
| `--no-packager`        | Does not start Metro if it is not already running.                                                                                |
| `--terminal <app>`     | The terminal app Metro opens in. Defaults to `$REACT_TERMINAL`, then the platform default.                                        |
| `--packager-log`       | Runs Metro in the background and logs to `desktop/build/metro.log`.                                                               |

On macOS, each build is signed ad hoc, and the keychain treats every rebuilt app as a new one: it asks again for each item the app stored. Set `APPLE_SIGNING_IDENTITY` to a signing identity, such as your Apple Development certificate, and `run-desktop` signs the app with it under the identifier from `desktop.json`. Choose "Always Allow" once and later builds keep that access.

```shell
security find-identity -v -p codesigning
APPLE_SIGNING_IDENTITY="Apple Development: Your Name (TEAMID)" npx react-native run-desktop
```

## package-desktop

Builds installable packages for the current operating system. See [Publishing your app](publishing-desktop).

| Option                  | Description                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `--target <formats>`    | Comma-separated formats: `app`, `dmg`, `nsis`, `deb`, `appimage`. Defaults to all that the OS can build. |
| `--project-root <path>` | The React Native project directory.                                                                      |
| `--out <dir>`           | The output directory.                                                                                    |

## create-library

Creates a TurboModule library for the desktop in a new directory.

```shell
npx react-native create-library AwesomeStorage
npx react-native create-library AwesomeStorage --type cpp
```

| Option                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `--type <rust\|cpp>`    | The native implementation language. Defaults to `rust`. |
| `--directory <path>`    | The output directory.                                   |
| `--module-name <name>`  | The native TurboModule name.                            |
| `--package-name <name>` | The npm package name.                                   |

## collect-node-addons

Copies the Node addons a bundle loads next to the packaged executable.

```shell
npx react-native collect-node-addons --bundle build/index.bundle --out build/node-addons
```

| Option                  | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `--bundle <path>`       | The bundle to scan for addon loads.                                      |
| `--out <dir>`           | The directory to copy the addons into.                                   |
| `--platform <platform>` | The target platform for matching shared libraries. Defaults to the host. |

## Prebuilt runtime

React Native's C++ runtime is large, so the first build downloads a prebuilt copy for your platform and React Native version instead of compiling it. Choose how the runtime is obtained in the app's `react-native.config.js`:

```js title="react-native.config.js"
module.exports = {
  project: {
    desktop: {
      prebuilt: 'auto', // 'auto' (default) | 'always' | 'never'
    },
  },
};
```

| Value      | Behavior                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `'auto'`   | Uses the prebuilt runtime when one is available for your platform and React Native version, and builds from source otherwise. |
| `'always'` | Uses the prebuilt runtime, and fails the build if it cannot be used.                                                          |
| `'never'`  | Always builds the runtime from source. The first build takes a while; later builds are incremental.                           |

Downloads are cached in `~/Library/Caches/react-native-gpui` on macOS, `%LOCALAPPDATA%\react-native-gpui` on Windows and `~/.cache/react-native-gpui` on Linux.

## Environment variables

For a one-off build, these variables take precedence over `react-native.config.js`:

| Variable                       | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `RN_GPUI_BUILD_FROM_SOURCE=1`  | Builds the runtime from source.              |
| `RN_GPUI_PREBUILT_DIR=<dir>`   | Uses an already extracted prebuilt runtime.  |
| `RN_GPUI_PREBUILT_CACHE=<dir>` | Changes the cache location.                  |
| `RN_GPUI_PREBUILT_OFFLINE=1`   | Uses the cache only, with no network access. |

The signing variables used by `package-desktop` are listed in [Publishing your app](publishing-desktop#signing).
