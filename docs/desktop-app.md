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

`App.launchArgs()` returns the command line arguments the process was started with, without the executable, such as `['new', 'note']` or `['--hidden']`. Parse them in JavaScript. A URL for one of your `urlSchemes` is also in the list, and [`Linking`](linking) reports it too.

## A second launch

With [`singleInstance`](desktop-json#singleinstance) set, starting the app again hands its arguments to the running copy and exits. The running copy shows and focuses its main window, restoring it from the minimized or hidden state, and then calls the handlers of `App.onSecondInstance(handler)` with the second launch's arguments. This is how a jump list entry or a Dock menu command that starts `app new note` reaches the app.

A URL among the arguments also arrives as a `url` event of `Linking`.

## Quitting

| Method           | Does                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `App.quit()`     | Quits as the application menu's Quit does.                                |
| `App.exit(code)` | Ends the process at once with the exit code, without closing windows.     |
| `App.relaunch()` | Starts the same executable with the same arguments, then quits this copy. |

To hide the application while it keeps running, for a tray app, hide its window with [`DesktopWindow.hide()`](desktopwindow).
