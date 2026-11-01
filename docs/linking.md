---
id: linking
title: Linking
---

`Linking` gives you a general interface to open links from your app.

Every link (URL) has a URL scheme. Some websites are prefixed with `https://` or `http://`, and `http` is the URL scheme. Let's call it scheme for short.

In addition to `https`, you're likely also familiar with the `mailto` scheme. When you open a link with the `mailto` scheme, your operating system opens your mail application. `Linking.openURL` hands the link to the operating system, which opens it with the application registered for its scheme: the default web browser for `https`, and the default mail application for `mailto`.

### Built-in URL Schemes

There are some URL schemes for core functionality that exist on every platform. The following is a non-exhaustive list, but covers the most commonly used schemes.

| Scheme           | Description                                          | Can be checked with `canOpenURL` |
| ---------------- | ---------------------------------------------------- | -------------------------------- |
| `mailto`         | Open the mail app, e.g. `mailto:hello@world.dev`     | ✅                               |
| `tel`            | Open the phone or calling app, e.g. `tel:+123456789` | ✅                               |
| `https` / `http` | Open the web browser, e.g. `https://example.com`     | ✅                               |

Other schemes can be opened with `openURL`, as long as an application on the machine handles them.

### Deep links

List the schemes that open your app in [`desktop.json`](desktop-json#app) as `urlSchemes`. Packaging registers them: `CFBundleURLTypes` in the macOS app, registry keys written by the Windows installer (and removed on uninstall), and `x-scheme-handler` entries in the Linux `.desktop` file. An AppImage cannot register itself, so a user has to integrate it with a tool such as AppImageLauncher. A scheme is registered only for an installed app, not for `run-desktop`. The installers are built by the packager, and the Windows and Linux registration has not been checked on a built package yet.

A URL that launches the app is returned by `getInitialURL()`. A URL that arrives while it runs is sent as a `url` event. On Windows and Linux the URL comes as a command-line argument. With `singleInstance`, which is the default when `urlSchemes` is set, a second launch passes its arguments to the running copy, which focuses its main window, and exits. The copies talk over a Unix socket in the user's runtime directory on macOS and Linux, and over a named pipe on Windows that only the same user can open and that refuses remote clients.

Any app on the machine can open your scheme, so treat the URL as untrusted input. See [Security](security).

## Example

### Open Links

```tsx
import { useCallback } from 'react';
import { Alert, Button, StyleSheet, View } from 'react-native';
import { Linking } from 'react-native';

const supportedURL = 'https://example.com';
const mailURL = 'mailto:hello@world.dev';

type OpenURLButtonProps = {
  url: string;
  children: string;
};

const OpenURLButton = ({ url, children }: OpenURLButtonProps) => {
  const handlePress = useCallback(async () => {
    // Checking if the link is supported for links with custom URL scheme.
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      // Opening the link with some app, if the URL scheme is "http" the web link should be opened
      // by some browser in the mobile
      await Linking.openURL(url);
    } else {
      Alert.alert(`Don't know how to open this URL: ${url}`);
    }
  }, [url]);

  return <Button title={children} onPress={handlePress} />;
};

const App = () => {
  return (
    <View style={styles.container}>
      <OpenURLButton url={supportedURL}>Open a web page</OpenURLButton>
      <OpenURLButton url={mailURL}>Write an email</OpenURLButton>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
```

# Reference

## Methods

### `addEventListener()`

```tsx
static addEventListener(
  type: 'url',
  handler: (event: {url: string}) => void,
): EventSubscription;
```

Add a handler to Linking changes by listening to the `url` event type and providing the handler. It is sent for [deep links](#deep-links).

---

### `canOpenURL()`

```tsx
static canOpenURL(url: string): Promise<boolean>;
```

Determine whether or not the app can open a given URL.

The method returns a `Promise` object. It resolves with `true` when an application on the machine is registered for the URL's scheme, and with `false` otherwise. The operating system answers: Launch Services on macOS, the registry's protocol associations on Windows, and `xdg-mime` on Linux.

**Parameters:**

| Name                                                     | Type   | Description      |
| -------------------------------------------------------- | ------ | ---------------- |
| url <div className="label basic required">Required</div> | string | The URL to open. |

:::note
For web URLs, the protocol (`"http://"`, `"https://"`) must be set accordingly!
:::

---

### `getInitialURL()`

```tsx
static getInitialURL(): Promise<string | null>;
```

Resolves with the link that launched the app, or `null` when it was launched some other way. See [deep links](#deep-links).

---

### `openSettings()`

```tsx
static openSettings(): Promise<void>;
```

Opens the operating system's settings app: System Settings on macOS and Settings on Windows. On Linux it starts the first of `gnome-control-center`, `systemsettings` and `xfce4-settings-manager` found on `PATH`, and the promise rejects when none is installed.

---

### `openURL()`

```tsx
static openURL(url: string): Promise<any>;
```

Try to open the given `url` with the application that the operating system has registered for it.

You can use other URLs, like a mail link, a map link, or any other URL that can be opened with the installed applications.

The method returns a `Promise` object. If the url opens, the promise is resolved. If there are no registered applications for the url, the promise is rejected.

**Parameters:**

| Name                                                     | Type   | Description      |
| -------------------------------------------------------- | ------ | ---------------- |
| url <div className="label basic required">Required</div> | string | The URL to open. |

:::note
For web URLs, the protocol (`"http://"`, `"https://"`) must be set accordingly!
:::
