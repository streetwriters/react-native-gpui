# Changelog

All notable changes to `@react-native-gpui/core` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- On Linux the `TitleBar` caption buttons follow the desktop's button layout: the side they sit on, their order, and which of them exist. GNOME and other GTK desktops are read through `gsettings`, KDE from `kwinrc`, and anything else gets minimize, maximize and close on the right. Windows and macOS are unchanged.
- On Linux a `TitleBar` keeps a row for the in-window menu bar just under the bar, and the menu bar is drawn there in the bar's colors, instead of as a strip above the whole window. `TitleBar` takes `menuBar={false}` to keep the strip. `Menu.setMenuBarSlot` and `Menu.clearMenuBarSlot` let a custom bar do the same.
- `Menu.setMenuBarVisible` now removes the in-window menu bar on Linux. It used to resize the content and leave the bar drawn.
- The drawn menu shows accelerators as `Ctrl+Shift+Z` and no longer reads `secondary-shift-z`.
- `TitleBar` draws small round caption buttons on Linux, in place of the full-height rectangles of Windows with a red close button.
- A popover tray's built-in Open item opens the popover. GNOME's panel shows the menu on a single click and reports only a double click, so the popover could not be reached from the menu.
- A tray with no icon and an app with no icon now shows a filled round glyph on Windows and Linux, which can be seen on a dark panel. It used to be a black outline that was hardly visible.
- The title bar's minimize, maximize and close buttons now act on Linux. A press on the button's glyph used to be taken by a plain view inside it, and the button's own pointer position was measured against its parent.
- `alwaysOnTop` keeps a window above others on X11, as `_NET_WM_STATE_ABOVE`. It used to raise the window once.
- `visibleOnAllWorkspaces` and `setVisibleOnAllWorkspaces` are ignored on Windows and Linux instead of failing, so a window opened with them still opens without an error.
- Fixed the Windows build failing with C2084 when two libraries in an app define the same file-local function, such as `react-native-screens` with `react-native-safe-area-context`.
- `DesktopAppConfig::accessory` runs the app with no Dock icon on macOS, which lets its windows show over another app's full-screen Space.
- A shortcut with `global: true` fires while no window of the app has focus, on macOS, Windows and X11. `Shortcuts.onFailure` reports keys the system refused.
- `visibleOnAllWorkspaces` shows a window on every Space on macOS, over full-screen apps when it is also `alwaysOnTop`, as an option of `DesktopWindow.open` and as `setVisibleOnAllWorkspaces`.
- A press on the empty part of a `pointerEvents="box-none"` view now reaches the view behind it, as in React Native, instead of stopping at the nearest ancestor.
- The keyboard focus ring is no longer drawn around a `TextInput`, or around a view that sets its own outline.
- `titleBar: 'none'` removes all system chrome: on macOS a borderless window with no border line or system corners.
- Fixed an empty `TextInput` drawing its placeholder at a different size than typed text and its caret in the wrong color, which flickered when the text was cleared.
- Windows take `windowButtons` and `shadow` options to hide the macOS traffic lights and the system shadow.
- Windows can be `transparent`, `blurred` or `mica` with the `background` window option, in `desktop.json` and in `DesktopWindow.open`.
- `StatusBar` renders nothing and its methods do nothing on desktop, so the default React Native app no longer fails on a missing native module.
- `ScrollBar` styles the scrollbar of the nearest `ScrollView`, including a list's: thickness, colors, radius, margin, visibility, auto-hide, and drag events. It needs a new prebuilt runtime.
- The scroll indicator can be dragged, and appears when the pointer reaches the edge of a scrollable view.
- The prebuilt runtime download reports its progress and where it was installed.
- Fixed a view with a `borderWidth` and a `borderRadius` drawing a square border over its rounded background, as on the `NewAppScreen` cards.
- Fixed a scroll view jumping up when a press re-rendered it after a trackpad flick had carried it past the end.

## 0.87.0-alpha.0 - 2026-11-01

- First release of the React Native desktop platform for macOS, Windows and Linux, for React Native 0.87.
- One GPU-accelerated renderer (GPUI) draws the core components on every platform, through Fabric and Yoga.
- Desktop APIs: multiple windows, application and context menus, a tray icon, keyboard shortcuts, deep links and single-instance apps.
- Accessibility tree for VoiceOver, Narrator and Orca; VoiceOver on macOS is the validated path.
- `Intl` on the system ICU.
- Uses the prebuilt C++ runtime 0.0.6, downloaded on the first build; set `prebuilt: 'never'` to build it from source.
