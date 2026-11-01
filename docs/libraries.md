---
id: libraries
title: Using Libraries
---

Finding and installing libraries works as described in React Native's [Using Libraries](https://reactnative.dev/docs/0.87/libraries). This page lists only what is different on desktop.

## Which libraries work

A library that is pure JavaScript works on desktop right away. A library with native code needs a desktop implementation before it can run:

- libraries with a desktop package are listed in [Supported libraries](supported-libraries);
- for others, see [Port an existing library](porting-libraries) or [write a native module](turbo-native-modules);
- the `expo-*` packages depend on the Expo Modules runtime, which is not available on desktop yet.

[React Native Directory](https://reactnative.directory) does not list desktop support yet, so check [Supported libraries](supported-libraries) and the library's README.

## Linking native code

Native code of libraries that support desktop is linked for you. When you run the app, [autolinking](autolinking) finds the libraries in your `package.json` that declare `platforms.desktop`, and builds their native code into the app:

```shell
npx react-native run-desktop
```

There is no `pod install` or Gradle step for the desktop target. If you also ship iOS and Android apps, link those platforms as you do today.
