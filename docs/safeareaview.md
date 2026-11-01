---
id: safeareaview
title: SafeAreaView
---

`SafeAreaView` keeps its content clear of the parts of the window that something else covers.

A desktop window's content area already excludes the title bar, so inside a normal window `SafeAreaView` is a plain [`View`](view) with no inset. The exception is a window drawn under a [`'transparent'` or `'hidden'` title bar](desktop-title-bar), where the content reaches behind the bar. There `SafeAreaView` adds the height of the bar to its top padding: the system bar's height on macOS, and the height of [`TitleBar`](desktop-title-bar) (38 points) on Windows and Linux. On Linux the inset appears only once the compositor has granted client-side decorations; without them its own bar stays and the inset is zero. The inset comes from [`useWindowState().topInset`](desktop-windows), and follows the window when its state changes.

It takes the props of [`View`](view).

## Example

```jsx
import { SafeAreaView, Text } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Text>Clear of the title bar</Text>
    </SafeAreaView>
  );
}
```
