---
id: desktop-app
title: The application
---

`App` is the running application as a whole: how it was started, a second launch, quitting and relaunching. It comes from `@react-native-gpui/core/desktop`.

```tsx
import { App } from '@react-native-gpui/core/desktop';

const [command, what] = App.launchArgs();

useEffect(() => {
  const subscription = App.onSecondInstance(args => open(args));
  return () => subscription.remove();
}, []);
```

## Launch arguments

`App.launchArgs()` returns the command line arguments the process was started with, without the executable, such as `['new', 'note']` or `['--hidden']`. Parse them in JavaScript. `--hidden` starts the app without showing its window (see [Starting hidden](desktop-tray#starting-hidden)); the app shows the window itself, with `DesktopWindow.current().show()`, when it should appear. A URL for one of your `urlSchemes` is also in the list, and [`Linking`](linking) reports it too.

## A second launch

With [`singleInstance`](desktop-json#singleinstance) set, starting the app again hands its arguments to the running copy and exits. The running copy shows and focuses its main window, restoring it from the minimized or hidden state, and then calls the handlers of `App.onSecondInstance(handler)` with the second launch's arguments. This is how a jump list entry or a Dock menu command that starts `app new note` reaches the app.

A URL among the arguments also arrives as a `url` event of `Linking`.

## Running copies side by side

The runtime keeps a few files per user: the window state, the `I18nManager` and settings files and the single-instance lock, in `<base>/rn-gpui`, where `<base>` is `~/Library/Application Support` (macOS), `%APPDATA%` (Windows) or `$XDG_CONFIG_HOME` (`~/.config`, Linux). Set `RN_GPUI_APP_DATA_DIR` to a folder to use it as `<base>` instead (an empty value is ignored). Copies started with different folders keep separate state and are not [single-instance](desktop-json#singleinstance) of each other, so several can run at once, for example one per development branch. On Linux the window frame measurement is cached in `$RN_GPUI_APP_DATA_DIR/cache`.

This is better than overriding `HOME`, which breaks the toolchains and, on macOS, the keychain. `@react-native-gpui/fs` follows the same variable: `appData` is `$RN_GPUI_APP_DATA_DIR/<id>`, `appCache` is `$RN_GPUI_APP_DATA_DIR/cache/<id>` and `appLogs` is `$RN_GPUI_APP_DATA_DIR/logs/<id>`.

## Quitting

| Method           | Does                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `App.quit()`     | Quits as the application menu's Quit does.                                |
| `App.exit(code)` | Ends the process at once with the exit code, without closing windows.     |
| `App.relaunch()` | Starts the same executable with the same arguments, then quits this copy. |
| `App.beep()`     | Plays the system alert sound (`shell.beep()` in Electron).                |

To hide the application while it keeps running, for a tray app, hide its window with [`DesktopWindow.hide()`](desktopwindow).
