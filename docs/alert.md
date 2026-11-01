---
id: alert
title: Alert
---

Launches an alert dialog with the specified title and message.

Optionally provide a list of buttons. Clicking any button will fire the respective onPress callback and dismiss the alert. By default, the only button will be an 'OK' button.

The alert is a sheet of the operating system on macOS, and a small dialog window of the app on Windows and Linux.

On macOS it is a sheet on the window and supports every option. `Alert.prompt` shows a text field (`plain-text`, `secure-text`) or a login and a password field (`login-password`, whose callback receives `{login, password}`), starting from `defaultValue`. With `cancelable: true`, Escape closes the alert and calls `onDismiss`; without it, Escape only presses a button with the `cancel` style. `userInterfaceStyle` sets the dialog's light or dark appearance.

On Windows and Linux the alert is a dialog window with the same options. `Alert.prompt` shows the text field or the login and password fields, `Tab` moves between the fields and the buttons, Enter presses the preferred button, and a `destructive` button is drawn in red. Escape presses the `cancel` button, or closes a `cancelable` alert and calls `onDismiss`. Closing the dialog window counts as a dismissal. `userInterfaceStyle` picks the light or dark appearance.

## Example

```jsx
import { Alert, Button, StyleSheet, View } from 'react-native';

const App = () => {
  const createTwoButtonAlert = () =>
    Alert.alert('Alert Title', 'My Alert Msg', [
      {
        text: 'Cancel',
        onPress: () => console.log('Cancel Pressed'),
        style: 'cancel',
      },
      { text: 'OK', onPress: () => console.log('OK Pressed') },
    ]);

  const createThreeButtonAlert = () =>
    Alert.alert('Alert Title', 'My Alert Msg', [
      {
        text: 'Ask me later',
        onPress: () => console.log('Ask me later pressed'),
      },
      {
        text: 'Cancel',
        onPress: () => console.log('Cancel Pressed'),
        style: 'cancel',
      },
      { text: 'OK', onPress: () => console.log('OK Pressed') },
    ]);

  return (
    <View style={styles.container}>
      <Button title={'2-Button Alert'} onPress={createTwoButtonAlert} />
      <Button title={'3-Button Alert'} onPress={createThreeButtonAlert} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
});

export default App;
```

## Buttons

You can specify any number of buttons. Each button shows its `text`, and calls its `onPress` when it is chosen. A button with `style: 'cancel'` is the one Escape presses, and `style: 'destructive'` marks the button as destructive: red text in the dialog, and the system's destructive look on macOS. `isPreferred` makes the button the one Enter presses.

# Reference

## Methods

### `alert()`

```tsx
static alert (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
);
```

**Parameters:**

| Name                                                       | Type                               | Description                                                             |
| ---------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| title <div className="label basic required">Required</div> | string                             | The dialog's title. Passing `null` or empty string will hide the title. |
| message                                                    | string                             | An optional message that appears below the dialog's title.              |
| buttons                                                    | [AlertButton](alert#alertbutton)[] | An optional array containing buttons configuration.                     |
| options                                                    | [AlertOptions](alert#alertoptions) | An optional Alert configuration.                                        |

---

## Type Definitions

### AlertButton

An object describing the configuration of a button in the alert.

| Type             |
| ---------------- |
| array of objects |

**Objects properties:**

| Name    | Type     | Description                               |
| ------- | -------- | ----------------------------------------- |
| text    | string   | Button label.                             |
| onPress | function | Callback function when button is pressed. |

---

### AlertOptions

| Type   |
| ------ |
| object |

`cancelable` lets Escape close the alert, and `onDismiss` is called when it is closed that way. `userInterfaceStyle` (`'light'` or `'dark'`) sets the dialog's appearance. The `keyboardType` of `Alert.prompt` has no effect, because a hardware keyboard has no keyboard types.
