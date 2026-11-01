---
id: keyboard
title: Keyboard
---

`Keyboard` is a small module for the keyboard focus of a text input.

On Windows the touch keyboard sends `keyboardWillShow`, `keyboardDidShow`, `keyboardWillHide`, `keyboardDidHide`, `keyboardWillChangeFrame` and `keyboardDidChangeFrame`, with `endCoordinates` taken from the area the keyboard covers, in the window's coordinates. macOS and Linux have no on-screen keyboard events, so none are sent there. The Windows events have not been tested on touch hardware. `Keyboard.dismiss()` removes focus from the focused `TextInput`, which is what it does on a phone.

## Example

```jsx
import { Keyboard, TextInput } from 'react-native';

<TextInput onSubmitEditing={Keyboard.dismiss} />;
```

# Reference

## Methods

### `dismiss()`

```tsx
static dismiss();
```

Blurs the focused `TextInput`. Does nothing when no input has focus.
