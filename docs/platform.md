---
id: platform
title: Platform
---

## Example

```jsx
import { Platform, StyleSheet, Text, ScrollView } from 'react-native';

const App = () => {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text>OS</Text>
      <Text style={styles.value}>{Platform.OS}</Text>
      <Text>System name</Text>
      <Text style={styles.value}>{Platform.constants.systemName}</Text>
      <Text>JavaScript engine</Text>
      <Text style={styles.value}>
        {JSON.stringify(Platform.constants.jsEngine)}
      </Text>
      <Text>Constants</Text>
      <Text style={styles.value}>
        {JSON.stringify(Platform.constants, null, 2)}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontWeight: '600',
    padding: 4,
    marginBottom: 8,
  },
});

export default App;
```

---

# Reference

## Properties

### `constants`

```tsx
static constants: PlatformConstants;
```

Returns an object which contains the constants related to the platform.

**Properties:**

| Name                | Type    | Description                                                                                                |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| reactNativeVersion  | object  | Information about the React Native version. Keys are `major`, `minor`, `patch` with optional `prerelease`. |
| systemName          | string  | The operating system: `'macOS'`, `'Windows'` or `'Linux'`.                                                 |
| jsEngine            | object  | The JavaScript engine, with the keys `name` and `version`. See [JavaScript engines](js-engines).           |
| interfaceIdiom      | string  | Always `'desktop'`.                                                                                        |
| isTesting           | boolean | Whether the app runs under the end-to-end test driver.                                                     |
| isDisableAnimations | boolean | Whether animations are turned off. When not set, it follows `isTesting`.                                   |
| osVersion           | string  | The operating system version, in the format described under [`Version`](#version).                         |

---

### `isDisableAnimations`

```tsx
static isDisableAnimations: boolean;
```

Returns `true` when animations are turned off, usually during automated tests started with `disableAnimations`. Falls back to [`isTesting`](#istesting) if not set.

| Type    |
| ------- |
| boolean |

---

### `isTesting`

```tsx
static isTesting: boolean;
```

Returns a boolean which defines if the application runs under the end-to-end test driver. See [End-to-end testing](desktop-testing).

| Type    |
| ------- |
| boolean |

---

### `OS`

```tsx
static OS: 'macos' | 'windows' | 'linux';
```

Returns a string with the operating system the app runs on. The same JavaScript bundle runs on all three, so the value is read at run time and not substituted when the bundle is built.

| Type                                    |
| --------------------------------------- |
| enum(`'macos'`, `'windows'`, `'linux'`) |

---

### `Version`

```tsx
static Version: string;
```

The version of the operating system: the product version on macOS (`15.1`), `major.minor.build` on Windows (`10.0.26100`), and the distribution's `VERSION_ID` on Linux (`24.04`), falling back to the kernel release. To branch on what the platform can do, check [`capabilities()`](desktop-app-info#capabilities) instead.

| Type   |
| ------ |
| string |

## Methods

### `select()`

```tsx
static select(config: Record<string, T>): T;
```

Returns the most fitting value for the platform you are currently running on.

#### Parameters:

| Name   | Type   | Required | Description                   |
| ------ | ------ | -------- | ----------------------------- |
| config | object | Yes      | See config description below. |

The `config` parameter is an object with the following keys, checked in this order:

- `macos`, `windows` or `linux` (any): the key of the current operating system
- `desktop` (any): all three desktop operating systems
- `native` (any)
- `default` (any)

**Example usage:**

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
