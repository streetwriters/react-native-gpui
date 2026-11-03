---
id: platform-support
title: Platform support
---

react-native-gpui targets macOS, Windows and Linux. This page lists what each platform provides, and the known limitations of the current release.

## Supported platforms and architectures

| Platform | Architectures | Renderer backend           |
| -------- | ------------- | -------------------------- |
| macOS    | arm64, x64    | Metal                      |
| Windows  | x64, arm64    | DirectX                    |
| Linux    | x64, arm64    | Vulkan, on Wayland and X11 |

Prebuilt copies of React Native's C++ runtime exist for every platform and architecture above, so a first build does not compile the runtime. See [Prebuilt runtime](cli#prebuilt-runtime). Pull-request CI covers macOS arm64, Windows x64 and Linux x64. The other architectures are built by the release workflows only.

`Platform.OS` is `macos`, `windows` or `linux`.

## Desktop features

Check these at run time with [`capabilities()`](desktop#capabilities) instead of assuming them.

| Feature                                      | macOS                              | Windows                                 | Linux                                                   |
| -------------------------------------------- | ---------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| [Application menu](desktop-application-menu) | System menu bar                    | In-window menu bar                      | In-window menu bar                                      |
| [Context menus](desktop-context-menus)       | Native or custom                   | Native or custom                        | Native or custom                                        |
| Keyboard trigger for context menu            | No                                 | Menu key, Shift + F10                   | Menu key, Shift + F10                                   |
| [Tray](desktop-tray)                         | Menu bar, anchored popover         | Notification area, popover at the click | Menu only on GNOME; popover elsewhere                   |
| [Title bar](desktop-title-bar)               | `default`, `transparent`, `hidden` | `default`, `transparent`, `hidden`      | Client-side decorations when the compositor allows them |
| Traffic lights position                      | Yes                                | No                                      | No                                                      |
| Always on top, window position               | Check `capabilities()`             | Check `capabilities()`                  | Check `capabilities()`; depends on the compositor       |
| Accessibility                                | VoiceOver                          | Not yet validated                       | Not yet validated                                       |
| Packages                                     | `.app`, `.dmg`                     | NSIS installer                          | `.deb`, `.AppImage`                                     |

## Known limitations

- **Linux windowing.** Who draws the title bar, where the caption buttons go, the window's corners and shadow, and what an app may place or raise differ between GNOME, KDE, X11 and Wayland. The app follows the desktop where it can; see [Windowing on Linux](desktop-windows#windowing-on-linux). It has been checked on GNOME 46 (Ubuntu 24.04) and the GNOME of Ubuntu 26.04, on KDE Plasma, on Wayland, and on X11 with Openbox and Xfce.
- **IME.** Text composition with an input method has not been tested.
- **Screen readers.** VoiceOver on macOS is the supported path. Accessibility on Windows and Linux has not been validated.
- **Offscreen effects.** A view with `opacity` below 1, a `blur` or `dropShadow` filter, a `mixBlendMode` or `isolation` is painted into a picture of its own. The picture is as large as the part of the view that is inside the window, so a blur does not take in content outside it. A scroll view that holds such a view does not cache its content between scroll frames, so it repaints on each one. Native surfaces are not part of the picture. See [`filter`](view-style-props#differences) and [`mixBlendMode`](view-style-props#differences).
- **3D transforms.** `perspective`, `rotateX` and `rotateY` are drawn flat. See [Transforms](https://reactnative.dev/docs/0.87/transforms).
- **Share.** On Windows [`Share`](share) opens the system share window and resolves when Windows asks for the content. Linux has no system share UI, so a dialog offers Copy and Email.
- **Scroll momentum.** On macOS the momentum of a trackpad flick comes from the system and `decelerationRate` has no effect. On Windows and Linux the scroll view carries a touchpad flick on itself, at `decelerationRate`; a mouse wheel has none.
- **Pull to refresh.** [`RefreshControl`](refreshcontrol) shows progress but has no pull gesture.
- **Keyboard events.** On Windows [`Keyboard`](keyboard) sends show and hide events for the touch keyboard, which have not been tested on touch hardware. macOS and Linux send none, so [`KeyboardAvoidingView`](keyboardavoidingview) lays out as a plain `View` there.
- **Not implemented.** The `fontVariationSettings` text style, which React Native 0.87 does not have.
- **Accessibility settings.** On Windows and Linux [`AccessibilityInfo`](accessibilityinfo) reads the screen reader, reduced motion and high contrast settings, but these have not been checked against a real screen reader.
- **Border rendering.** The fidelity of some border styles against React Native on mobile has not been fully compared.
- **`Intl`.** It needs the operating system's ICU: Windows 10 1903 or later on Windows, `libicu` 64 or later on Linux. Without one it falls back to plain formatting. See [JavaScript environment](javascript-environment#internationalization-intl).
- **WebGPU and WebViews.** There is no WebGPU surface and no web view component yet.
- **Over-the-air updates.** They are not supported.
- **Signing.** Windows installers are unsigned unless you provide a certificate. See [Publishing](publishing-desktop).
- **Engine binaries.** The Hermes binaries that the engine package downloads are not checksum-verified.
- **Node addons.** Only pure Node-API addons that do not need Node built-in modules load. See [Node addons](native-modules-node-addons).

## Compatibility

Every React Native 0.87 component and API is listed. "Supported" means it behaves as the [React Native documentation](https://reactnative.dev/docs/0.87/getting-started) describes; a link goes to this site when desktop adds or changes something, and to the React Native documentation otherwise.

### Components

| Name                                                                       | Status    | Notes                                                             |
| -------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| [ActivityIndicator](activityindicator)                                     | Supported | Drawn in the style of each operating system.                      |
| [Button](https://reactnative.dev/docs/0.87/button)                         | Supported |                                                                   |
| [FlatList](https://reactnative.dev/docs/0.87/flatlist)                     | Supported |                                                                   |
| [Image](image)                                                             | Partial   | A few mobile-only props have no effect.                           |
| [ImageBackground](https://reactnative.dev/docs/0.87/imagebackground)       | Supported |                                                                   |
| [KeyboardAvoidingView](keyboardavoidingview)                               | Partial   | Responds to the Windows touch keyboard only.                      |
| [Modal](modal)                                                             | Supported | Escape and the window close button call `onRequestClose`.         |
| [Pressable](pressable)                                                     | Supported | Hover and `hitSlop` follow the pointer.                           |
| [RefreshControl](refreshcontrol)                                           | Partial   | Shows progress; no pull gesture.                                  |
| [SafeAreaView](safeareaview)                                               | Supported | Insets for a title bar the app draws.                             |
| [ScrollView](scrollview)                                                   | Supported | Momentum on Windows and Linux is simulated at `decelerationRate`. |
| [SectionList](https://reactnative.dev/docs/0.87/sectionlist)               | Supported |                                                                   |
| StatusBar                                                                  | Partial   | Desktop windows have no status bar: it renders nothing.           |
| [Switch](switch)                                                           | Supported | Drawn in the style of each operating system.                      |
| [Text](text)                                                               | Supported | `fontVariationSettings` is not in React Native 0.87.              |
| [TextInput](textinput)                                                     | Partial   | IME composition is untested.                                      |
| [TouchableHighlight](https://reactnative.dev/docs/0.87/touchablehighlight) | Supported |                                                                   |
| [TouchableOpacity](https://reactnative.dev/docs/0.87/touchableopacity)     | Supported |                                                                   |
| [TouchableWithoutFeedback](touchablewithoutfeedback)                       | Supported |                                                                   |
| [View](view)                                                               | Supported | 3D transforms are drawn flat.                                     |
| [VirtualizedList](https://reactnative.dev/docs/0.87/virtualizedlist)       | Supported |                                                                   |
| [VirtualView](virtualview)                                                 | Supported | Modes follow the position in the scroll view.                     |

### Props

| Name                              | Status        | Notes                                                        |
| --------------------------------- | ------------- | ------------------------------------------------------------ |
| `experimental_accessibilityOrder` | Not supported | Accepted but not applied; focus order follows the view tree. |
| `onAccessibilityMagicTap`         | Not supported | Accepted but never dispatched.                               |

### APIs and hooks

| Name                                                                         | Status    | Notes                                                                       |
| ---------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| [AccessibilityInfo](accessibilityinfo)                                       | Partial   | Screen reader settings on Windows and Linux are unvalidated.                |
| [Alert](alert)                                                               | Supported | A sheet on macOS, a dialog window on Windows and Linux.                     |
| [Animated](https://reactnative.dev/docs/0.87/animated)                       | Supported |                                                                             |
| [Appearance](https://reactnative.dev/docs/0.87/appearance)                   | Supported |                                                                             |
| [AppRegistry](https://reactnative.dev/docs/0.87/appregistry)                 | Supported |                                                                             |
| [AppState](appstate)                                                         | Supported |                                                                             |
| [BackHandler](https://reactnative.dev/docs/0.87/backhandler)                 | Supported | Mouse back button and Escape in a modal.                                    |
| [DevSettings](devsettings)                                                   | Supported | `addMenuItem` lists items in the Dev Menu.                                  |
| [Dimensions](https://reactnative.dev/docs/0.87/dimensions)                   | Supported |                                                                             |
| [Easing](https://reactnative.dev/docs/0.87/easing)                           | Supported |                                                                             |
| [I18nManager](https://reactnative.dev/docs/0.87/i18nmanager)                 | Supported |                                                                             |
| [Keyboard](keyboard)                                                         | Partial   | Show and hide events on the Windows touch keyboard only.                    |
| [LayoutAnimation](https://reactnative.dev/docs/0.87/layoutanimation)         | Partial   | Not covered by the end-to-end suite.                                        |
| [Linking](linking)                                                           | Supported | Custom URL schemes through the installer.                                   |
| [PanResponder](https://reactnative.dev/docs/0.87/panresponder)               | Supported |                                                                             |
| [PixelRatio](https://reactnative.dev/docs/0.87/pixelratio)                   | Supported |                                                                             |
| [Platform](platform)                                                         | Supported | `Platform.OS` is `macos`, `windows` or `linux`.                             |
| [PlatformColor](https://reactnative.dev/docs/0.87/platformcolor)             | Supported |                                                                             |
| [ReactNativeVersion](https://reactnative.dev/docs/0.87/reactnativeversion)   | Supported |                                                                             |
| [RootTag](https://reactnative.dev/docs/0.87/roottag)                         | Supported |                                                                             |
| [Settings](https://reactnative.dev/docs/0.87/settings)                       | Supported |                                                                             |
| [Share](share)                                                               | Partial   | The system share UI on macOS and Windows; a Copy and Email dialog on Linux. |
| [StyleSheet](https://reactnative.dev/docs/0.87/stylesheet)                   | Supported |                                                                             |
| [Transforms](https://reactnative.dev/docs/0.87/transforms)                   | Partial   | `perspective`, `rotateX` and `rotateY` are drawn flat.                      |
| [Vibration](vibration)                                                       | Partial   | Taps a Force Touch trackpad on macOS only.                                  |
| [useColorScheme](https://reactnative.dev/docs/0.87/usecolorscheme)           | Supported |                                                                             |
| [useWindowDimensions](https://reactnative.dev/docs/0.87/usewindowdimensions) | Supported |                                                                             |

### Not part of desktop

React Native APIs for mobile hardware and services have no desktop meaning and are not provided: screen orientation, status bar and navigation bar control, brightness, sensors, NFC, health and wearables platforms, widgets, in-app purchases and background tasks. Gate them at run time with `Platform.OS`, or with `isDesktopAvailable`. A tray-resident app takes the place of background tasks.
