---
id: desktop-system
title: System
---

`@react-native-gpui/system` covers what an app asks of the operating system beyond its windows: start at login, restart, keeping its windows out of screen captures, how long the user has been idle, and the Dock badge and bounce. Opening a path or URL with the system is `fs.reveal` and `fs.openExternal` in [File system](desktop-file-system#reveal-and-open); the tray, closing to the tray and the Dock are in [Tray](desktop-tray).

```shell
npm install @react-native-gpui/system
```

## Start at login

```js
import { getLaunchAtLogin, setLaunchAtLogin } from '@react-native-gpui/system';

await setLaunchAtLogin(true, { hidden: true });
const enabled = await getLaunchAtLogin();
await setLaunchAtLogin(false);
```

`hidden` starts the app with `--hidden`, which opens it without showing its window; see [Starting hidden](desktop-tray#starting-hidden). `args` adds other arguments. Calling `setLaunchAtLogin(true, ...)` again replaces the earlier options, and turning it off when it is off does nothing.

On macOS the app is registered as a launch agent in `~/Library/LaunchAgents`, named after the bundle identifier, or the executable's name outside a bundle, and macOS tells the user that a background item was added. Windows (the Run key) and Linux (an autostart entry) are set up through the same call but are not tested yet.

## Restart

```js
import { restart } from '@react-native-gpui/system';

await restart();
await restart({ args: ['--hidden'] });
```

Quits the app and starts it again once it has exited, so an app that allows [one instance](desktop-json#singleinstance) does not hand the launch back to the copy that is closing. The new copy gets the current arguments, or `args` when given. A packaged macOS app is opened again through the system, as a double click would. The promise does not settle when the restart goes ahead, because the app is gone. Unix only for now.

## Privacy mode

```js
import {
  isContentProtected,
  setContentProtected,
} from '@react-native-gpui/system';

await setContentProtected(true);
await isContentProtected(); // true
```

Hides the app's windows from screenshots, screen recordings and screen sharing; others see nothing where the window is. It covers every window of the app, and windows opened later, such as a tray popover, are covered within half a second of appearing. `isContentProtected()` reads the windows back, so it is `true` only while every open window carries the protection. macOS uses the window's sharing type. Windows uses `SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE`, which needs Windows 10 version 2004 or later, and the Windows code is not tested yet. On Linux `setContentProtected` rejects with `ERR_UNSUPPORTED` and `isContentProtected` resolves with `false`.

The setting is not remembered between launches: set it again at startup.

## Jump list

```js
import { setJumpList } from '@react-native-gpui/system';

await setJumpList([
  { title: 'New note', args: ['new', 'note'], description: 'Create a note' },
  { title: 'New notebook', args: ['new', 'notebook'] },
]);
await setJumpList([]); // remove the tasks
```

Sets the tasks in the jump list of the app's taskbar button on Windows, the list that opens when the button is right-clicked. Each call replaces the earlier tasks. Choosing a task starts the app with its `args`; an app that allows [one instance](desktop-json#singleinstance) hands them to the running copy, which receives them in [`App.onSecondInstance`](desktop-app), and `App.launchArgs()` has them when the app was not running. A task takes `title`, `args`, `description` (its tooltip) and `iconPath` with `iconIndex` for an `.ico` file or an executable; the app's own icon is the default. The jump list is kept by Windows between launches, so it only needs to be set again when it changes.

This is `ICustomDestinationList` and is not tested yet, since it needs a Windows machine. Elsewhere the call rejects with `ERR_UNSUPPORTED`; the macOS equivalent is [`Menu.setDockMenu`](menu#setdockmenu).

## Idle time

```js
import { getIdleTime } from '@react-native-gpui/system';

const seconds = await getIdleTime();
```

The seconds since the user last pressed a key, moved the mouse or touched the trackpad, anywhere in the session and not only in this app. To act after the user has been away, poll it, for example once a second, and compare it with the limit. macOS reads it from `CGEventSourceSecondsSinceLastEventType`; Windows uses `GetLastInputInfo` but is not tested yet; Linux rejects with `ERR_UNSUPPORTED`.

## Badge and attention

```js
import {
  setBadge,
  getBadge,
  requestAttention,
  cancelAttention,
} from '@react-native-gpui/system';

await setBadge(3); // a number or text on the Dock icon
await setBadge(null); // remove it; 0 and '' do too
await requestAttention(); // bounce the icon once while the app is in the background
await requestAttention({ critical: true }); // bounce until the app is activated
await cancelAttention();
```

`getBadge()` returns the text now shown, or `null`. A bounce is only made while another app is active. macOS only: other platforms reject with `ERR_UNSUPPORTED`; a taskbar overlay for Windows is not done.
