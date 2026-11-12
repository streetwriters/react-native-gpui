---
id: troubleshooting
title: Troubleshooting
---

import Tabs from '@theme/Tabs'; import TabItem from '@theme/TabItem'; import constants from '@site/core/TabsConstants';

These are some common issues you may run into while setting up React Native for desktop. If you encounter something that is not listed here, try [searching for the issue on GitHub](https://github.com/streetwriters/react-native-gpui/issues).

## Port already in use

The [Metro bundler][metro] runs on port 8081. If another process is already using that port, you can either terminate that process, or change the port that the bundler uses.

### Terminating a process on port 8081

On macOS and Linux, run the following command to find the id for the process that is listening on port 8081:

```shell
sudo lsof -i :8081
```

Then run the following to terminate the process:

```shell
kill -9 <PID>
```

On Windows you can find the process using port 8081 using [Resource Monitor](https://stackoverflow.com/questions/48198/how-can-you-find-out-which-process-is-listening-on-a-port-on-windows) and stop it using Task Manager.

### Using a port other than 8081

Pass the port to `run-desktop`. It starts Metro on that port and tells the app where to load the bundle from:

```shell
npx react-native run-desktop --port 8082
```

If an app is already running and should load from another server, open the [dev menu](debugging#the-dev-menu) and choose **Configure Bundler**. Enter the server as `host:port`, and the app reloads from it.

## The first build is slow

The first build compiles the desktop app, and downloads a prebuilt copy of React Native's C++ runtime for your platform. Later builds are incremental. If the build is compiling the runtime itself, no prebuilt matched, or you set the runtime to build from source. See [Prebuilt runtime](cli#prebuilt-runtime).

## The prebuilt runtime cannot be downloaded

If you are offline, or behind a proxy that blocks GitHub downloads, the build cannot fetch the runtime. Either build it from source, or point the build at one that you downloaded:

```shell
RN_GPUI_BUILD_FROM_SOURCE=1 npx react-native run-desktop
RN_GPUI_PREBUILT_DIR=/path/to/extracted/runtime npx react-native run-desktop
RN_GPUI_PREBUILT_OFFLINE=1 npx react-native run-desktop   # use the cache only
```

## Build errors

Run `npx react-native doctor-desktop` first. It checks every tool the build needs and prints the fix for each one that is missing. See [`doctor-desktop`](cli#doctor-desktop).

<Tabs groupId="os" queryString defaultValue={constants.defaultOs} values={constants.oses}>
<TabItem value="macos">

- **`unable to find utility "metal"`** from a plain `cargo build`: the Metal shader compiler only ships with full Xcode. Build with `npx react-native run-desktop`, which compiles the shaders at startup when the compiler is missing, or pass `--features runtime-shaders` to Cargo.
- **`cmake: command not found`**: install it with `brew install cmake`.
- **`cargo: command not found`**: restart the terminal after installing Rust, or run `source "$HOME/.cargo/env"`.

</TabItem>
<TabItem value="windows">

- **`nasm` is not recognized**: add `C:\Program Files\NASM` to your `PATH`. Its installer does not.
- **Perl errors during the build**: Git for Windows ships its own `perl`, which cannot build the native dependencies. Make sure Strawberry Perl comes before Git's on your `PATH`.
- **`cl` is not recognized**: run the build from a **Developer PowerShell for VS 2022**.
- **"Filename too long" errors**: enable long paths, as described in [Set up your environment](set-up-your-environment).

</TabItem>
<TabItem value="linux">

- **`Package xkbcommon-x11 was not found`**: install the development packages listed in [Set up your environment](set-up-your-environment), including `libxkbcommon-x11-dev`.
- **The linker cannot find a library**: run `npx react-native doctor-desktop`. It names the development package to install for each library that `pkg-config` cannot find.
- **`cargo: command not found`**: restart the terminal after installing Rust, or run `. "$HOME/.cargo/env"`.

</TabItem>
</Tabs>

## Node is too old

React Native for desktop needs Node.js 22.13 or newer. Check with `node --version`, and install a newer version, for example with [nvm](https://github.com/nvm-sh/nvm).

## No transports available

React Native implements a polyfill for WebSockets. These [polyfills](https://github.com/react/react-native/blob/v0.87.1/packages/react-native/Libraries/Core/InitializeCore.js) are initialized as part of the react-native module that you include in your application through `import React from 'react'`. If you load another module that requires WebSockets, such as [Firebase](https://github.com/react/react-native/issues/3645), be sure to load/require it after react-native:

```
import Firebase from 'firebase';
```

## Unable to start Metro on Linux

### Error: `"code":"ENOSPC","errno":"ENOSPC"`

The issue is caused by the number of directories that [inotify](https://github.com/guard/listen/blob/master/README.md#increasing-the-amount-of-inotify-watchers) can monitor. To solve it, run this command in your terminal window:

```shell
echo fs.inotify.max_user_watches=582222 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```

## A native module or library is not found

- A library that has native code needs a desktop implementation. Check [Supported libraries](supported-libraries).
- After installing a library with native code, restart `run-desktop`, so that [autolinking](autolinking) runs again.
- A `.node` addon that fails to load may need more than Node-API. See the [limits of Node addons](native-modules-node-addons#limits).

[metro]: https://metrobundler.dev/
