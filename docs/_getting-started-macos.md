## Installing dependencies

You will need Node, Rust, CMake and Xcode.

Node and Rust are used on every operating system. React Native needs **Node.js 22.13 or newer**, and the desktop renderer is written in Rust, so you need a **stable Rust toolchain** installed with [rustup](https://rustup.rs).

### Node and Rust

We recommend installing Node and CMake using [Homebrew](http://brew.sh/). Run the following commands in a Terminal after installing Homebrew:

```shell
brew install node cmake
```

Install Rust with rustup:

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your Terminal afterwards so that `cargo` is on your `PATH`.

:::note
If you already have Node installed, make sure it is Node 22.13 or newer. Check with `node --version`.
:::

### Xcode

Install **Xcode** from the Mac App Store. The command line tools alone are not enough: the renderer compiles Metal shaders, and the Metal shader compiler ships with Xcode.

After installing Xcode:

1. Open Xcode once and accept the license agreement, or run `sudo xcodebuild -license accept`.
2. Make sure the command line tools point to Xcode: open **Xcode > Settings > Locations** and pick your Xcode version in the **Command Line Tools** dropdown, or run `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`.
3. On **Xcode 26 and newer**, the Metal toolchain is a separate download:

```shell
xcodebuild -downloadComponent MetalToolchain
```

## Verifying your setup

Open a new Terminal and run the doctor:

```shell
npx @react-native-gpui/cli doctor
```

It checks every tool on this page and prints how to fix each one that is missing or misconfigured:

```text
Desktop development on macOS
 ✓ Node.js 22.20.0
 ✓ Rust 1.96.0
 ✓ Cargo 1.96.0
 ✓ CMake 3.31.4
 ✓ Xcode 26.6
 ✓ Xcode license
 ✖ Metal shader compiler: the Metal toolchain is not installed
     Fix: xcodebuild -downloadComponent MetalToolchain

1 problem found.
```

Inside a React Native project, `npx react-native doctor-desktop` runs the same checks, and `npx react-native doctor` lists them in a **Desktop** section next to its own.

## Troubleshooting

- **`xcrun: error: unable to find utility "metal"`**: the Metal toolchain is not installed. Run `xcodebuild -downloadComponent MetalToolchain` on Xcode 26 and newer, and check that the command line tools point to the full Xcode and not to `/Library/Developer/CommandLineTools`.
- **`cargo: command not found`**: restart the Terminal, or run `source "$HOME/.cargo/env"`.
- **Building for Intel and Apple silicon**: the app is built for the architecture of the Mac you build on.
