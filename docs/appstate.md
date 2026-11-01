---
id: appstate
title: AppState
---

`AppState` can tell you if the app is in the foreground or background, and notify you when the state changes.

## On desktop

The state comes from the app's windows:

- `active`: one of the app's windows has focus.
- `inactive`: no window has focus, but at least one is visible and not minimized.
- `background`: no window is visible, because they are all hidden or minimized.

Moving focus from one of the app's windows to another does not change the state. The `focus` and `blur` events follow `active`. `memoryWarning` is sent when the system reports low memory: on macOS the memory-pressure notification, on Windows the low-memory resource notification, and on Linux a pressure-stall trigger on `/proc/pressure/memory` when the kernel provides one.

### App States

- `active` - The app is running in the foreground
- `background` - The app is running in the background

## Basic Usage

To see the current state, you can check `AppState.currentState`, which will be kept up-to-date.

:::info
If you are using the legacy architecture, `currentState` will be `null` at launch until it is retrieved asynchronously from the native side.
:::

```jsx
import { useRef, useState, useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

const AppStateExample = () => {
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current?.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App has come to the foreground!');
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
      console.log('AppState', appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text>Current state is: {appStateVisible}</Text>
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

export default AppStateExample;
```

This example will only ever appear to say "Current state is: active" because the app is only visible to the user when in the `active` state. If you want to experiment with the code we recommend to use your own device instead of embedded preview.

---

# Reference

## Events

### `change`

This event is received when the app state has changed. The listener is called with one of [the current app state values](appstate#app-states).

## Methods

### `addEventListener()`

```tsx
static addEventListener(
  type: AppStateEvent,
  listener: (state: AppStateStatus) => void,
): EventSubscription;
```

Sets up a function that will be called whenever the specified event type on AppState occurs. Valid values for `eventType` are
[listed above](#events). Returns the `EventSubscription`.

## Properties

### `currentState`

```tsx
static currentState: AppStateStatus;
```
