---
id: platform-specific-code
title: Platform-Specific Code
---

When building a cross-platform app, you'll want to re-use as much code as possible. Scenarios may arise where it makes sense for the code to be different, for example you may want to implement separate behavior for macOS, Windows and Linux, or share a codebase with a mobile app.

React Native provides two ways to organize your code and separate it by platform:

- Using the [`Platform` module](platform-specific-code.md#platform-module).
- Using [platform-specific file extensions](platform-specific-code.md#platform-specific-extensions).

Certain components may have properties that work on one platform only. All of these props are annotated with `@platform` and have a small badge next to them on the website.

## Platform module

React Native provides a module that detects the platform in which the app is running. You can use the detection logic to implement platform-specific code. Use this option when only small parts of a component are platform-specific.

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  height: Platform.OS === 'macos' ? 52 : 44,
});
```

`Platform.OS` is the operating system the app runs on: `macos`, `windows` or `linux`. The same JavaScript bundle runs on all three, so the value is read at run time.

`Platform.constants` has more detail, such as the operating system name and the JavaScript engine:

```tsx
import { Platform } from 'react-native';

Platform.constants.systemName; // 'macOS', 'Windows' or 'Linux'
Platform.constants.jsEngine; // {name: 'hermes', version: '…'}
```

There is also a `Platform.select` method available that, given an object, returns the value for the platform you are currently running on. The keys are checked in this order: the operating system (`'macos'`, `'windows'` or `'linux'`), then `'desktop'` for all three, then `'native'`, then `'default'`.

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...Platform.select({
      macos: {
        backgroundColor: 'red',
      },
      windows: {
        backgroundColor: 'green',
      },
      default: {
        // other platforms, such as Linux
        backgroundColor: 'blue',
      },
    }),
  },
});
```

This will result in a container having `flex: 1` on all platforms, a red background color on macOS, a green background color on Windows, and a blue background color on other platforms.

Because `Platform.select` accepts any value, it also works for components:

```tsx
const Component = Platform.select({
  desktop: () => require('ComponentDesktop'),
  default: () => require('ComponentMobile'),
})();

<Component />;
```

### Detecting the operating system version

`Platform.Version` is the operating system version string. It is a placeholder on desktop at the moment, so do not branch on it. Check for a feature instead, with [`capabilities()`](desktop#capabilities).

## Platform-specific extensions

When your platform-specific code is more complex, you should consider splitting the code out into separate files. React Native will detect when a file has a `.desktop.` extension and load the relevant platform file when required from other components.

For example, say you have the following files in your project:

```shell
BigButton.desktop.js
BigButton.js
```

You can then require the component as follows:

```tsx
import BigButton from './BigButton';
```

React Native will automatically pick up the right file based on the running platform. On desktop, files resolve in this order: `.desktop.js`, then `.native.js`, then the plain `.js`. The same applies to `.ts` and `.tsx`.

:::note
There is no `.macos.js`, `.windows.js` or `.linux.js` extension. A `.desktop.js` file is shared by all three operating systems. To vary behavior by operating system inside it, use `Platform.OS` or `Platform.select`.
:::

### Libraries that only ship iOS code

A library that has `.ios.js` and `.android.js` files but no `.native.js` file works on desktop through a fallback: when a module cannot be resolved for desktop, Metro tries the `ios` variant. This makes many libraries work unchanged, and is why a library can ship a `.desktop.js` file to override it.

## Native-module extension

You can also use the `.native.js` extension when a module needs to be shared between NodeJS/Web and React Native but it has no differences between native platforms. This is especially useful for projects that have common code shared among React Native and ReactJS.

For example, say you have the following files in your project:

```shell
Container.js # picked up by webpack, Rollup or any other Web bundler
Container.native.js # picked up by the React Native bundler for desktop and mobile (Metro)
```

You can still import it without the `.native` extension, as follows:

```tsx
import Container from './Container';
```

**Pro tip:** Configure your Web bundler to ignore `.native.js` extensions in order to avoid having unused code in your production bundle, thus reducing the final bundle size.

## Sharing code with a mobile app

An app can ship to mobile and desktop from one codebase: the project keeps its `ios/` and `android/` folders and adds `desktop/`. Put code that only makes sense on desktop in `.desktop.js` files, or behind `Platform.select({desktop: …})`. See [Get started](environment-setup).
