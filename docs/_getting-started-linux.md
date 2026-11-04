import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Installing dependencies

You will need Node, Rust, CMake, a C++ compiler and a few development packages.

React Native needs **Node.js 22.13 or newer**, and the desktop renderer is written in Rust, so you need **Rust 1.98 or newer** installed with [rustup](https://rustup.rs).

### System packages

Install the compiler, CMake, `pkg-config`, Perl and the X keyboard and XCB development libraries with your distribution's package manager:

<Tabs groupId="distro" queryString defaultValue="debian" values={[{label: 'Debian / Ubuntu', value: 'debian'}, {label: 'Fedora', value: 'fedora'}, {label: 'Arch', value: 'arch'}]}>
<TabItem value="debian">

```shell
sudo apt install build-essential cmake pkg-config perl \
  libxkbcommon-dev libxkbcommon-x11-dev libxcb1-dev
```

</TabItem>
<TabItem value="fedora">

```shell
sudo dnf install gcc-c++ make cmake pkgconf perl \
  libxkbcommon-devel libxkbcommon-x11-devel libxcb-devel
```

</TabItem>
<TabItem value="arch">

```shell
sudo pacman -S base-devel cmake perl libxkbcommon libxkbcommon-x11 libxcb
```

</TabItem>
</Tabs>

### Node and Rust

Install **Node.js 22.13 or newer**. Your distribution's package may be older, so we recommend [nvm](https://github.com/nvm-sh/nvm) or the [NodeSource](https://github.com/nodesource/distributions) packages:

```shell
nvm install 22
```

Install Rust with rustup:

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your terminal afterwards so that `cargo` is on your `PATH`.

## Verifying your setup

Open a new terminal and run the doctor:

```shell
npx @react-native-gpui/cli doctor
```

It checks every tool on this page and prints how to fix each one that is missing or misconfigured:

```text
Desktop development on Linux
 ✓ Node.js 22.20.0
 ✓ Rust 1.98.1
 ✓ Cargo 1.98.1
 ✓ CMake 3.28.3
 ✓ C++ compiler 13.2.0
 ✓ pkg-config 1.8.1
 ✓ Perl 5.38.2
 ✓ xkbcommon development files 1.6.0
 ✖ xkbcommon-x11 development files: pkg-config cannot find xkbcommon-x11
     Fix: Debian/Ubuntu: sudo apt install libxkbcommon-x11-dev, Fedora: sudo dnf install libxkbcommon-x11-devel, Arch: sudo pacman -S libxkbcommon-x11
 ✓ xcb development files 1.15

1 problem found.
```

Inside a React Native project, `npx react-native doctor-desktop` runs the same checks, and `npx react-native doctor` lists them in a **Desktop** section next to its own.

## Troubleshooting

- **`Package xkbcommon-x11 was not found`**: install `libxkbcommon-x11-dev` (Debian / Ubuntu), `libxkbcommon-x11-devel` (Fedora) or `libxkbcommon-x11` (Arch).
- **`cargo: command not found`**: restart the terminal, or run `. "$HOME/.cargo/env"`.
- **Node is too old**: `node --version` reports less than 22.13. Install a newer Node with nvm.
