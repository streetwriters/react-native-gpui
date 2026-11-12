## Installing dependencies

You will need Node, Rust, CMake and the Xcode command line tools.

Node and Rust are used on every operating system. React Native needs **Node.js 22.13 or newer**, and the desktop renderer is written in Rust, so you need **Rust 1.98 or newer** installed with [rustup](https://rustup.rs).

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

### Xcode command line tools

Install the command line tools, which have the compiler and the macOS SDK:

```shell
xcode-select --install
```

Full Xcode is optional. With it, the renderer's Metal shaders are compiled when you build the app. Without it, `run-desktop` and `package-desktop` turn on the `runtime-shaders` feature and the shaders are compiled when the app starts. If you use full Xcode, accept its license once (`sudo xcodebuild -license accept`); on Xcode 26 and newer the Metal toolchain is a separate download (`xcodebuild -downloadComponent MetalToolchain`), and without it the build falls back to runtime shaders as well.

## Verifying your setup

Open a new Terminal and run the doctor:

```shell
npx @react-native-gpui/cli doctor
```

It checks every tool on this page and prints how to fix each one that is missing or misconfigured:

```text
Desktop development on macOS
 ✓ Node.js 22.20.0
 ✓ Rust 1.98.1
 ✓ Cargo 1.98.1
 ✓ CMake 3.31.4
 ✓ Xcode command line tools 26.6
 ✓ Xcode license
 ✖ CMake: cmake was not found
     Fix: brew install cmake

1 problem found.
```

Inside a React Native project, `npx react-native doctor-desktop` runs the same checks, and `npx react-native doctor` lists them in a **Desktop** section next to its own.

## Troubleshooting

- **`xcrun: error: unable to find utility "metal"`** from a plain `cargo build`: the Metal compiler only ships with full Xcode. Build with `npx react-native run-desktop`, which compiles the shaders at startup instead, or pass `--features runtime-shaders` to Cargo.
- **`cargo: command not found`**: restart the Terminal, or run `source "$HOME/.cargo/env"`.
- **Building for Intel and Apple silicon**: the app is built for the architecture of the Mac you build on.
