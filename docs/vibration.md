---
id: vibration
title: Vibration
---

Vibrates the device. On desktop there is no vibration motor, so this is the closest the platform has.

On macOS `Vibration.vibrate()` plays the system's generic haptic tap on the trackpad. It is felt only on a Force Touch trackpad while a finger rests on it. A pattern is timed in JavaScript: the tap is played after each wait in the array. On Windows and Linux every call does nothing and does not throw.

## Example

```jsx
import { Vibration } from 'react-native';

Vibration.vibrate();
Vibration.vibrate([0, 200, 100, 200]);
Vibration.cancel();
```

# Reference

## Methods

### `vibrate()`

```tsx
static vibrate(pattern?: number | number[], repeat?: boolean);
```

Triggers a tap. With an array, each entry is a wait in milliseconds, as on iOS, where the length of a vibration is fixed. `repeat` repeats the pattern until `cancel()` is called.

---

### `cancel()`

```tsx
static cancel();
```

Stops a pattern that is playing or repeating.
