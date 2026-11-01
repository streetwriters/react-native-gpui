---
id: getting-started-without-a-framework
title: Get Started Without a Framework
hide_table_of_contents: true
---

import PlatformSupport from '@site/src/theme/PlatformSupport';

<PlatformSupport platforms={['macos', 'windows', 'linux']} />

If you have constraints that are not served well by a [Framework](/architecture/glossary#react-native-framework), or you prefer to write your own Framework, you can create a React Native app without using a Framework. This is the path the [getting started guide](environment-setup) takes for desktop: react-native-gpui is a platform for React Native itself, so there is no framework to set up.

To do so, you'll first need to [set up your environment](set-up-your-environment). Once you're set up, continue with the steps below to create an application and start developing.

### Step 1: Creating a new application

Use the react-native-gpui CLI to create a new project called "AwesomeProject":

```shell
npx @react-native-gpui/cli init AwesomeProject
cd AwesomeProject
npm install
```

This is not necessary if you already have a React Native app. In that case, add the desktop target to it:

```shell
npx react-native init-desktop
```

### Step 2: Start your application

```shell
npx react-native run-desktop
```

The command builds the desktop app, starts Metro if it is not running, and opens the app. The first build takes a few minutes, because it compiles the desktop app itself, and downloads a prebuilt copy of React Native's C++ runtime.

If everything is set up correctly, you should see your new app in a window shortly.

### Step 3: Modifying your app

Now that you have successfully run the app, let's modify it.

- Open `App.tsx` in your text editor of choice and edit some lines.
- The application should reload automatically once you save your changes. This is thanks to [Fast Refresh](https://reactnative.dev/docs/0.87/fast-refresh).

### That's it!

Congratulations! You've successfully run and modified your first React Native desktop app.

## Now what?

- Turn this new React Native app into your own: [add windows](desktop-windows), a [menu](desktop-application-menu) and a [tray icon](desktop-tray).
- If you want to add this new React Native code to an existing application, see [the desktop project](desktop-project).
- If you're curious to learn more about React Native, check out the [Introduction to React Native](getting-started).
