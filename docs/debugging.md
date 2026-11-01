---
id: debugging
title: Debugging Basics
---

import Tabs from '@theme/Tabs'; import TabItem from '@theme/TabItem'; import constants from '@site/core/TabsConstants';

:::note
Debugging features, such as the Dev Menu, LogBox, and React Native DevTools are disabled in release (production) builds.
:::

## The Dev Menu

React Native provides an in-app developer menu providing access to debugging features. Open it with the keyboard shortcut:

- macOS: <kbd>Cmd ⌘</kbd> + <kbd>D</kbd>
- Windows and Linux: <kbd>Ctrl</kbd> + <kbd>D</kbd>

The menu is available in debug builds, and is turned off in release builds. To change that, set `devMenu` in [`desktop.json`](desktop-json), or call `dev_menu(bool)` on the app config in [`main.rs`](desktop-project#mainrs).

| Item                     | Action                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Reload                   | Reloads the JavaScript bundle.                                                                              |
| Open DevTools            | Opens [React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools) for the running app. |
| Toggle Element Inspector | Shows or hides the Element Inspector, to inspect the views under the pointer.                               |
| Toggle Perf Monitor      | Shows or hides the [Perf Monitor](#performance-monitor).                                                    |
| Fast Refresh             | Turns [Fast Refresh](https://reactnative.dev/docs/0.87/fast-refresh) on or off.                             |

The menu also lets you change **where the app loads its bundle from**. Choose **Configure Bundler**, enter the Metro server as `host:port`, and press Enter: the app reloads from it.

## Opening DevTools

[React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools) is our built-in debugger for React Native. It allows you to inspect and understand how your JavaScript code is running, similar to a web browser.

To open DevTools, either:

- Select "Open DevTools" in the Dev Menu.
- Press <kbd>j</kbd> in the terminal where Metro runs.

On first launch, DevTools will open to a welcome panel, along with an open console drawer where you can view logs and interact with the JavaScript runtime. From the top of the window, you can navigate to other panels, including the integrated React Components Inspector and Profiler.

Learn more in our [React Native DevTools guide](https://reactnative.dev/docs/0.87/react-native-devtools).

## LogBox

LogBox is an in-app tool that displays when warnings or errors are logged by your app.

### Fatal Errors

When an unrecoverable error occurs, such as a JavaScript syntax error, LogBox will open with the location of the error. In this state, LogBox is not dismissable since your code cannot be executed. LogBox will automatically dismiss once the syntax error is fixed — either via Fast Refresh or after a manual reload.

### Console Errors and Warnings

Console errors and warnings are displayed as on-screen notifications with a red or yellow badge.

- **Errors** will display with a notification count. Click the notification to see an expanded view and to paginate through other logs.
- **Warnings** will display a notification banner without details, prompting you to open React Native DevTools.

When React Native DevTools is open, all errors except fatal errors will be hidden to LogBox. We recommend using the Console panel within React Native DevTools as a source of truth, due to various LogBox options which can hide or adjust the level of certain logs.

<details>
<summary>**💡 Ignoring logs**</summary>

LogBox can be configured via the `LogBox` API.

```js
import { LogBox } from 'react-native';
```

#### Ignore all logs

LogBox notifications can be disabled using `LogBox.ignoreAllLogs()`. This can be useful in situations such as giving product demos.

```js
LogBox.ignoreAllLogs();
```

#### Ignore specific logs

Notifications can be disabled on a per-log basis via `LogBox.ignoreLogs()`. This can be useful for noisy warnings or those that cannot be fixed, e.g. in a third-party dependency.

```js
LogBox.ignoreLogs([
  // Exact message
  'Warning: componentWillReceiveProps has been renamed',

  // Substring or regex match
  /GraphQL error: .*/,
]);
```

:::note

LogBox will treat certain errors from React as warnings, which will mean they don't display as an in-app error notification. Advanced users can change this behaviour by customising LogBox's warning filter using [`LogBoxData.setWarningFilter()`](https://github.com/react/react-native/blob/d334f4d77eea538dff87fdcf2ebc090246cfdbb0/packages/react-native/Libraries/LogBox/Data/LogBoxData.js#L338).

:::

</details>

## Performance Monitor

An in-app performance overlay shows the frame rates and memory use of the app. Toggle it by selecting **"Toggle Perf Monitor"** in the Dev Menu, or from code with [`PerfMonitor`](desktop-perf-monitor). It is painted by the renderer above every window, so it does not compete with the app it measures.

:::info
The Performance Monitor runs in-app and is a guide. For accurate measurements, use the profiling tools of your operating system: Instruments on macOS, the Windows Performance Analyzer on Windows, and `perf` on Linux. See [Profiling](profiling).
:::
