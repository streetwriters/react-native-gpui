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

| Option                 | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `disableAnimations`    | Turns animations off, so tests do not wait for them.                            |
| `initialProps`         | Props for the root component.                                                   |
| `offscreen`            | Launches with a hidden, unfocused window. `RN_GPUI_TEST_HEADED=1` overrides it. |
| `idleOptions`          | What to ignore when waiting for the app to be idle.                             |
| `executable`, `bundle` | Run a specific build and bundle.                                                |
| `args`, `env`          | Arguments and environment variables for the app.                                |
| `timeout`, `logFile`   | The launch timeout, and where to write the app's log.                           |

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

Assertions wait until they pass or time out, so a test does not need explicit sleeps. `app.waitForIdle()` waits until the app has no pending frames, animations, timers, network requests or JavaScript work.

### Screenshots

Baselines are stored next to the test, in `__screenshots__/gpui/<platform>-<arch>@<scale>x/`. They are kept per operating system and display scale, so a Retina Mac and a standard display each keep exact baselines. Run with `-u` or `RN_GPUI_UPDATE_SNAPSHOTS=1` to write or refresh them.

## Driving the shell

`DesktopApp` also drives the desktop shell, so tests can cover menus, windows and the tray:

| Area             | Methods                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Windows          | `setWindowSize`, `getWindowBounds`, `focusWindow`, `listWindows`, `windowState`, `windowClose`, `osCloseWindow`, `reopen` |
| Menus            | `getAppMenu`, `triggerMenuItem`, `menuBarState`, `openMenuBarMenu`                                                        |
| Context menus    | `getContextMenu`, `selectContextMenuItem`, `dismissContextMenu`                                                           |
| Dev menu         | `showDevMenu`, `getDevMenu`, `devMenuPerform`, `closeDevMenu`                                                             |
| Tray             | `trayInstall`, `trayState`, `trayClick`, `trayHide`, `trayDestroy`                                                        |
| Dialogs          | `alertState`, `alertRespond`, `alertEscape`                                                                               |
| Share and links  | `shareOpen`, `shareAnchor`, `shareChoose`, `openUrl`                                                                      |
| Clipboard        | `clipboardText`, `setClipboardText`                                                                                       |
| Pointer and keys | `mouseDown`, `mouseUp`, `mouseMove`, `focus`, `press`, `typeText`, `drag`, `scroll`, `hover`                              |
| Accessibility    | `a11yTree`, `a11yNode`                                                                                                    |
| Other            | `tree`, `screenshot`, `reload`, `getPerfMonitor`, `readLogs`, `allowErrors`, `assertNoErrors`                             |

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
