---
id: environment-setup
title: Get Started with React Native for Desktop
hide_table_of_contents: true
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

**react-native-gpui lets developers who know React create native desktop apps for macOS, Windows and Linux.** You write your app once with React Native components, and it runs as a regular executable on each desktop operating system.

An app is drawn by [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui), a GPU-accelerated renderer written in Rust, and talks to the operating system through native modules. The React Native platform is called `desktop`: that is the Metro platform and file extension (`*.desktop.tsx`), the Codegen platform, and the key a library declares in its `react-native.config.js`. `Platform.OS` stays the operating system: `macos`, `windows` or `linux`.

## Before you begin

[Set up your environment](set-up-your-environment) first. You need Node.js, Rust, CMake and the compiler for your operating system.

## Create a new app

<Tabs groupId="start" queryString defaultValue="new" values={[{label: 'New app', value: 'new'}, {label: 'Existing app', value: 'existing'}]}>
<TabItem value="new">

```shell
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
```

The new app is a regular React Native app: it keeps its `ios/` and `android/` folders, and gets a `desktop/` folder for the desktop target.

</TabItem>
<TabItem value="existing">

To add the desktop target to a React Native app you already have, run this in the app's folder:

```shell
npx react-native init-desktop
```

It adds the `desktop/` folder and installs the packages it needs. Pass `--skip-install` to write the scaffold without installing packages.

</TabItem>
</Tabs>

## Run your app

```shell
npx react-native run-desktop
```

This builds the desktop app, starts Metro if it is not running, and opens the app. Edit `App.tsx` and the app updates with [Fast Refresh](https://reactnative.dev/docs/0.87/fast-refresh).

The first build downloads a prebuilt copy of React Native's C++ runtime for your platform, so only the desktop app itself is compiled. Later builds are incremental. See [Prebuilt runtime](cli#prebuilt-runtime) to change this.

To try the optimized build, which bundles the JavaScript into the app:

```shell
npx react-native run-desktop --release
```

## Package your app

When the app is ready to share, build an installer for the operating system you are on:

```shell
npx react-native package-desktop
```

See [Publishing your app](publishing-desktop).

## What's next

- Learn the [basics of React Native components](https://reactnative.dev/docs/0.87/intro-react-native-components), which work the same way on desktop.
- Add [windows](desktop-windows), a [menu](desktop-application-menu), [keyboard shortcuts](desktop-keyboard-shortcuts) and a [tray icon](desktop-tray).
- Configure the app's name, icon and window in [`desktop.json`](desktop-json).
- Look up a command in the [CLI reference](cli).
