---
id: share
title: Share
---

Opens a dialog to share text content with other apps.

On macOS it shows the system share sheet in the middle of the window. On Windows it opens the system share window. On Linux there is no system share UI, so a small dialog offers **Copy** and **Email**: Copy puts the message and the link on the clipboard and resolves with `sharedAction` and the `activityType` `copy`; Email opens the default mail app with the `subject` as the subject and the message and link as the body, and resolves with `email`; Cancel, Escape or closing the dialog resolves `dismissedAction`.

The Windows window gives no sign that it was dismissed, so, as with React Native on Android, the promise resolves with `sharedAction` (and no `activityType`) as soon as Windows asks for the content. It resolves with `dismissedAction` only if the window cannot be shown. The Windows window has not been tried against every share target.

## Example

```jsx
import React from 'react';
import { Alert, Share, Button } from 'react-native';

const ShareExample = () => {
  const onShare = async () => {
    try {
      const result = await Share.share({
        message: 'React Native GPUI | A framework for building desktop apps',
        url: 'https://example.com',
      });
      if (result.action === Share.sharedAction) {
        console.log('shared with', result.activityType);
      } else if (result.action === Share.dismissedAction) {
        console.log('dismissed');
      }
    } catch (error) {
      Alert.alert(error.message);
    }
  };
  return <Button onPress={onShare} title="Share" />;
};

export default ShareExample;
```

## Methods

### `share()`

```tsx
static share(
  content: {title?: string; message?: string; url?: string},
  options?: {subject?: string},
): Promise<{action: string; activityType?: string | null}>;
```

At least one of `message` and `url` is required. The promise resolves with `Share.sharedAction` and the name of the chosen service as `activityType`, or with `Share.dismissedAction` when the sheet is closed without choosing one. `title`, `subject`, `anchor` and the other mobile options are accepted and ignored.

### `sharedAction`

```tsx
static sharedAction: 'sharedAction';
```

### `dismissedAction`

```tsx
static dismissedAction: 'dismissedAction';
```
