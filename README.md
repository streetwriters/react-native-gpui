# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui):
one GPU-accelerated renderer for **macOS, Windows and Linux**.

The React Native platform is called **`desktop`**. That is the Metro platform and
its file extension (`*.desktop.tsx`), the Codegen platform, the `platform=`
bundle parameter, and the key a module declares in its `react-native.config.js`
(`platforms.desktop`). A module's native code lives in its `desktop/` folder.
GPUI is the renderer underneath: `Platform.OS` is still the operating system
(`macos`, `windows`, `linux`).

## Environment setup

Every platform needs **Node.js 22.13 or newer** and **Rust** (stable, installed
with [rustup](https://rustup.rs)).

### macOS

Install **Xcode** from the App Store (the command line tools alone have no Metal
shader compiler), then:

```sh
xcodebuild -downloadComponent MetalToolchain   # Xcode 26 and newer
brew install cmake
```

### Windows

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install -e --id Kitware.CMake
winget install -e --id StrawberryPerl.StrawberryPerl
winget install -e --id NASM.NASM
winget install -e --id Rustlang.Rustup
winget install -e --id OpenJS.NodeJS.LTS
```

- Add NASM to `PATH` (`C:\Program Files\NASM`); its installer does not.
- Keep Strawberry Perl ahead of Git's Perl on `PATH`.
- Run every build from a **Developer PowerShell for VS 2022**.

Enable long paths once, from an administrator PowerShell:

```powershell
New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

### Linux

```sh
# Debian / Ubuntu
sudo apt install build-essential cmake pkg-config perl \
  libxkbcommon-dev libxkbcommon-x11-dev libxcb1-dev

# Fedora
sudo dnf install gcc-c++ make cmake pkgconf perl \
  libxkbcommon-devel libxkbcommon-x11-devel libxcb-devel

# Arch
sudo pacman -S base-devel cmake perl libxkbcommon libxkbcommon-x11 libxcb
```

## Create an app

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
```

The app keeps its `ios/` and `android/` folders and gets a `desktop/` target.

To add the desktop target to an existing React Native app instead:

```sh
npx react-native init-desktop
```

## Run

```sh
npx react-native run-desktop             # debug build, loads JS from Metro
npx react-native run-desktop --release   # release build with the bundled JS
```

The first build downloads a prebuilt copy of React Native's C++ runtime for
your platform, so only the desktop app itself is compiled.

### Prebuilt C++ runtime

Choose how the C++ runtime is built in the app's `react-native.config.js`:

```js
module.exports = {
  project: {
    desktop: {
      prebuilt: 'auto', // 'auto' (default) | 'always' | 'never'
    },
  },
};
```

| Value    | Behaviour                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `auto`   | Use the prebuilt runtime when one is available for your platform and React Native version; otherwise build from source. |
| `always` | Use the prebuilt runtime, and fail the build if it cannot be used.                                                      |
| `never`  | Always build the runtime from source. The first build takes a while; later builds are incremental.                      |

Downloads are cached (`~/Library/Caches/react-native-gpui` on macOS,
`%LOCALAPPDATA%\react-native-gpui` on Windows, `~/.cache/react-native-gpui` on
Linux). For a one-off build, these environment variables take precedence:

- `RN_GPUI_BUILD_FROM_SOURCE=1` builds from source.
- `RN_GPUI_PREBUILT_DIR=<dir>` uses an already-extracted runtime.
- `RN_GPUI_PREBUILT_CACHE=<dir>` changes the cache location.
- `RN_GPUI_PREBUILT_OFFLINE=1` uses the cache only, with no network access.

Inside this repository, `auto` uses the prebuilt runtime only while the C++
sources match the ones it was built from, so local C++ changes are always
compiled.

## Package

```sh
npx react-native package-desktop              # every format this OS can build
npx react-native package-desktop --target dmg  # one format
```

Always a release build, into `desktop/build/dist/`.

| OS      | Formats                 |
| ------- | ----------------------- |
| macOS   | `.app`, `.dmg`          |
| Windows | NSIS installer (`.exe`) |
| Linux   | `.deb`, `.AppImage`     |

The app is described by `desktop/desktop.json` beside the crate; all fields are
optional.

```json
{
  "$schema": "../node_modules/@react-native-gpui/cli/desktop.schema.json",
  "productName": "My App",
  "identifier": "com.example.myapp",
  "icon": "assets/icon.png",
  "window": { "title": "My App", "width": 1024, "height": 768 },
  "bundle": { "targets": "all", "category": "DeveloperTool" }
}
```

`desktop.<os>.json` is merged over the base for that OS (RFC 7386; `null` removes
a key). `app.json`'s old `desktop` key is rejected with a pointer to the new file.

Signing is read from the environment, never from the file: macOS is ad-hoc signed
unless `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE` and
`APPLE_CERTIFICATE_PASSWORD` are set (`APPLE_ID` / `APPLE_PASSWORD` notarize);
Windows is unsigned unless `WINDOWS_CERTIFICATE_THUMBPRINT` is set.

Packaging relinks the release binary without absolute rpaths, so
`desktop/build/target/release/<app>` stops running from the checkout until
`run-desktop --release` rebuilds it.

## License

[MIT](LICENSE)
