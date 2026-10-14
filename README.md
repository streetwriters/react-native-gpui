# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui):
one GPU-accelerated renderer for **macOS, Windows and Linux**.

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

The first build compiles React Native's C++ runtime and takes a while; later
builds are incremental.

## License

[MIT](LICENSE)
