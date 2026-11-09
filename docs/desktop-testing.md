---
id: desktop-testing
title: End-to-end testing
---

`@react-native-gpui/testing` launches your real desktop app and drives it from a test. It also provides a Vitest preset for unit-testing components.

## Setup

An app created with the CLI already has what it needs: a `desktop/vitest.e2e.config.ts`, an example in `desktop/e2e/app.e2e.ts`, and a script:

```shell
npm run test:e2e
```

```ts title="desktop/vitest.e2e.config.ts"
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import desktopPreset from '@react-native-gpui/testing/vitest-preset-e2e';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
process.env.RN_GPUI_TEST_PROJECT = projectRoot;

export default mergeConfig(
  defineConfig(desktopPreset),
  defineConfig({
    root: projectRoot,
    test: { include: ['desktop/e2e/**/*.e2e.ts'] },
  }),
);
```

In an existing app, install `@react-native-gpui/testing` and Vitest, and add the same configuration.

## Writing a test

```ts title="desktop/e2e/counter.e2e.ts"
import { beforeAll, afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({ disableAnimations: true });
});

afterAll(async () => {
  await app.close();
});

test('counts presses', async () => {
  await app.getByText('Increment').click();
  await desktopExpect(app.getByTestId('count')).toHaveText('1');
});
```

`launchApp` starts the app, usually with a hidden window, connects to it, and returns a `DesktopApp`.

### Launch options

| Option                 | Description                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `disableAnimations`    | Turns animations off, so tests do not wait for them.                                                                                                      |
| `initialProps`         | Props for the root component.                                                                                                                             |
| `offscreen`            | Launches with a hidden, unfocused window. `RN_GPUI_TEST_HEADED=1` overrides it. Without it the window is shown, behind the others, and never takes focus. |
| `idleOptions`          | What to ignore when waiting for the app to be idle.                                                                                                       |
| `executable`, `bundle` | Run a specific build and bundle.                                                                                                                          |
| `args`, `env`          | Arguments and environment variables for the app.                                                                                                          |
| `timeout`, `logFile`   | The launch timeout, and where to write the app's log.                                                                                                     |

## Staying in the background

A test run does not disturb whoever is using the machine. While the test driver is on (`RN_GPUI_TEST_DRIVER=1`, which `launchApp` sets), or when `RN_GPUI_BACKGROUND=1` is set on any run, the app:

- never activates itself, so it does not take keyboard focus or the menu bar. On macOS it runs as an accessory application, with no Dock icon, so the Dock does not bounce.
- opens its windows without making them key or main. With `offscreen: true` they stay hidden. Otherwise, on macOS, they are shown behind every other window. `window.show()` also puts a window behind the others, and `window.focus()` gives it logical focus only.
- keeps everything tests use working without operating system focus: `app.setWindowActive()` gives a window focus and key events, pointer input comes from the driver, and screenshots are drawn by the app, not captured from the screen.

`launchApp` checks it on macOS: a test fails if the launched app is the frontmost application once it is idle. The check uses `lsappinfo`; `frontmostApplicationPid()` is exported for your own assertions.

### Wheel and pinch

`app.scroll(tag, dx, dy, repeat, phase, intervalMs, options)` sends a platform scroll event to the node's centre, the event a trackpad or wheel sends, so it goes through [`onWheel`](desktop-input#wheel-events) handlers before it scrolls anything. `options.lines` sends a mouse wheel notch in lines instead of trackpad pixels, and `options.modifiers` holds keys (`shift`, `control`, `alt`, `platform`). `phase` is `started`, `moved` or `ended`. A negative `dy` scrolls down. `app.pinch(tag, delta, phase, modifiers)` sends a trackpad pinch, where `delta` is the magnification change. `waitForIdle` waits for a wheel event that is still waiting for its handlers.

### Layout and paint work

`app.layoutStats({ reset })` returns what the window's layout and paint did since the counters were last reset, from gpui-fast's layout statistics: `frames`; `nodesCreated`, `nodesReused`, `nodesFreed`; `styleCompares`, `styleWrites`, `childrenWrites`; `measureCalls`, `measurementsKept`, `measurementsReplayed`; `linesShaped`; `viewsBuilt` and `viewsReused`; `layerFramesComposited`, `layerFramesRepainted`, `tilesDirtied`, `layerRebuildsForInput` and `layersDemoted` for scroll layers; `layoutNodes`, the nodes the window holds; and in milliseconds `buildMs`, `prepaintMs`, `paintMs`, `computeLayoutMs`, `measureMs` and `shapeMs`. The counts always run. The times are zero until the first call with `reset: true`, so start a measurement with one, do the work, and read it with another `reset: true` call, which also starts the next interval. Divide by `frames` for a per-frame figure. Frames that the driver draws itself count too.

### Which display

A background run opens its windows on the display `RN_GPUI_TEST_DISPLAY` names, centred in it; `launchApp` and the runtime default to the secondary display when there is one. Hidden windows are placed there too. `RN_GPUI_TEST_DISPLAY` chooses another: `main`, `secondary`, or an index into `app.displays()`. A display that does not exist falls back to the main one, with a log line. `app.displays()` lists the displays and their bounds in the app's coordinates.

A window ordered behind the others can be covered by them, and macOS stops presenting frames for a covered (occluded) window, so a test that reads the real screen back with `app.compositeScreenshot()` needs the window in front. `RN_GPUI_TEST_ON_TOP=1` orders the window front without activating the app or giving it focus; the compositor test of native views sets it.

`RN_GPUI_TEST_DISPLAY=retina` opens the window on the display with the highest scale factor when that is at least 2, and on the main display otherwise. Use it for a test that depends on the display's own scale, which no override changes: AppKit places a native view (`NativeViewFixture`, a web view) at the real display's scale, so the layout of such a test, which is at 2x, only matches a 2x display. Choose it by scale and not by `main` or `secondary`, because which display is main changes with the arrangement. A test that does not care about the scale keeps the default, the secondary display, to stay out of the user's way. `app.displays()` reports each display's `scaleFactor` (macOS; `null` elsewhere), so a test can skip when it finds no 2x display.

`launchApp` also sets `RN_GPUI_TEST_SCALE_FACTOR=2`, so windows lay out and draw at 2x whichever display they are on, and a pixel comparison against a 2x reference does not depend on the display. Set it to another value, or set the variable yourself, to test another scale. It needs a runtime built with a gpui-fast revision that carries the override.

`RN_GPUI_TEST_HEADED=1` turns background mode off for a run you are watching, and `RN_GPUI_BACKGROUND=0` does the same for any run.

Focus and blur events reach a text input only in an active window. While the test driver is on, windows report themselves active to the UI toolkit from the moment they open, without the application being activated, so those tests run in the background too (`RN_GPUI_BACKGROUND=0` turns it off). This needs a runtime built with a gpui-fast revision that has the test-driver activity hook.

## Finding elements

`app` finds elements with locators, the way Playwright does:

| Method                     | Finds                                  |
| -------------------------- | -------------------------------------- |
| `getByTestId(id)`          | An element by its `testID`.            |
| `getByText(text, {exact})` | An element by its text.                |
| `getByRole(role, {name})`  | An element by its accessibility role.  |
| `getByLabel(label)`        | An element by its accessibility label. |

A locator can be narrowed with `first()`, `nth(index)` and `within(scope)`, and acts with `click`, `doubleClick`, `rightClick`, `hover`, `type`, `press`, `clear`, `scroll`, `dragTo`, `textContent`, `isVisible`, `count` and `screenshot`. Clicks take a `button` (`left`, `right`, `middle`, `back` or `forward`), a `clickCount` and `modifiers`.

## Assertions

```ts
import {
  expect as desktopExpect,
  expectNoA11yViolations,
} from '@react-native-gpui/testing';

await desktopExpect(locator).toBeVisible();
await desktopExpect(locator).toHaveText('1');
await desktopExpect(app).toMatchScreenshot('home');
await expectNoA11yViolations(app);
```

| Assertion                                                       | Checks                                    |
| --------------------------------------------------------------- | ----------------------------------------- |
| `toBeVisible()`, `toBeHidden()`                                 | Whether the element is visible.           |
| `toBeEnabled()`, `toBeDisabled()`                               | Whether the element is enabled.           |
| `toBeSelected()`, `toBeChecked()`                               | The selected or checked state.            |
| `toHaveText(text)`, `toContainText(text)`, `toHaveValue(value)` | The text of the element.                  |
| `toHaveCount(n)`                                                | How many elements match.                  |
| `toHaveAccessibleName(name)`, `toHaveAccessibleRole(role)`      | The accessibility name or role.           |
| `toMatchScreenshot(name)`                                       | The element or window against a baseline. |

When the wait times out because JavaScript work never finishes, start the app with `RN_GPUI_DEBUG_JS_TASKS=1` (in `env`): the error then lists each queued or running JavaScript task with how long it has been there and the call stack that queued it. The stacks are symbols of the native runtime, so they name the C++ entry point that scheduled the task. The variable is for debugging; it costs a stack capture per task. macOS and Linux only.

`app.click()` and `locator.click()` move the pointer onto the target, then dispatch a press and a release through the window's own input path, the one a real pointer reaches, both in one step. Several listeners see each event, deepest view first and the window's root last, so a listener that drops the release can be covered by one that comes later; a test of the press and release path itself uses `app.mouseDown()` and `app.mouseUp()` at positions of its choice, such as a release outside the window, which only the window-level listener sees.

Assertions wait until they pass or time out, so a test does not need explicit sleeps. `app.waitForIdle()` waits until the app has no pending frames, animations, timers, network requests or JavaScript work. `app.idleStatus()` says what is holding it up: for pending timers it lists each one with the delay it was set for and the time left (`timer 12: set for 700 ms, due in 640 ms`), which is how to tell a timer of the app's own from work the runtime is doing. Only one-shot timers due within 1.5 seconds count.

### Screenshots

Baselines are stored next to the test, in `__screenshots__/gpui/<platform>-<arch>@<scale>x/`. They are kept per operating system and display scale, so a Retina Mac and a standard display each keep exact baselines. Run with `-u` or `RN_GPUI_UPDATE_SNAPSHOTS=1` to write or refresh them.

## Driving the shell

`DesktopApp` also drives the desktop shell, so tests can cover menus, windows and the tray:

| Area             | Methods                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows          | `setWindowSize`, `getWindowBounds`, `focusWindow`, `setWindowActive`, `listWindows`, `windowState`, `windowClose`, `osCloseWindow`, `reopen` |
| File drops       | `dragFiles`, `dropFiles`, `dragFilesExit`                                                                                                    |
| Menus            | `getAppMenu`, `triggerMenuItem`, `menuBarState`, `openMenuBarMenu`                                                                           |
| Context menus    | `getContextMenu`, `selectContextMenuItem`, `dismissContextMenu`                                                                              |
| Dev menu         | `showDevMenu`, `getDevMenu`, `devMenuPerform`, `closeDevMenu`                                                                                |
| Tray             | `trayInstall`, `trayState`, `trayClick`, `trayHide`, `trayDestroy`                                                                           |
| Dialogs          | `alertState`, `alertRespond`, `alertEscape`                                                                                                  |
| Share and links  | `shareOpen`, `shareAnchor`, `shareChoose`, `openUrl`                                                                                         |
| Clipboard        | `clipboardText`, `setClipboardText`                                                                                                          |
| Pointer and keys | `mouseDown`, `mouseUp`, `mouseMove`, `focus`, `press`, `typeText`, `drag`, `scroll`, `pinch`, `hover`                                        |
| Accessibility    | `a11yTree`, `a11yNode`                                                                                                                       |
| Other            | `tree`, `screenshot`, `reload`, `getPerfMonitor`, `readLogs`, `allowErrors`, `assertNoErrors`                                                |

`alertState` returns the title, buttons and fields of the alert on screen, and `alertRespond(button, texts)` types into its fields and presses a button. On macOS the alert is a system sheet that a test cannot press, so the driver answers it directly; set `RN_GPUI_ALERT_DIALOG=1` in `env` to make macOS show the same dialog window that Windows and Linux use. `shareOpen` and `shareChoose` do the same for the macOS share picker.

By default a test fails if the app logs an error. Use `app.allowErrors(/pattern/)` for the ones you expect.

## Running options

```shell
npm run test:e2e                      # run the suite
RN_GPUI_TEST_HEADED=1 npm run test:e2e   # show the app windows
RN_GPUI_TEST_KEEP_APP=1 npm run test:e2e      # leave the apps running afterwards
npm run test:e2e -- -u                # update screenshot baselines
```

Tests launch hidden windows by default. Use a visible window when you want to watch a test, or leave the app running to inspect a failure.

## Unit tests

`@react-native-gpui/testing/vitest-preset` configures Vitest to resolve `.desktop.*` and `.native.*` files before the plain ones, and to run React Native components in a Node environment:

```ts title="vitest.config.ts"
import { defineConfig, mergeConfig } from 'vitest/config';
import desktopPreset from '@react-native-gpui/testing/vitest-preset';

export default mergeConfig(defineConfig(desktopPreset), defineConfig({}));
```
