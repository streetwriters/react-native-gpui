/**
 * Compile-time proof that the desktop View props are visible without importing
 * the desktop entry point.
 *
 * Nothing here imports `@react-native-gpui/core/desktop`: the augmentation comes
 * from `react-native-gpui-env.d.ts`, which is what an app gets from the CLI. This
 * file is never executed — `tsc --noEmit` is the test.
 *
 * @format
 */

import React from 'react';
import { View } from 'react-native';

export function DesktopPropsTypeProbe(): React.JSX.Element {
  return (
    <View
      desktopDragRegion
      desktopWindowControl="minimize"
      onContextMenu={event => {
        // Every field the types promise, read to prove the shape.
        const {
          x,
          y,
          pageX,
          pageY,
          windowId,
          button,
          ctrlKey,
          shiftKey,
          altKey,
          metaKey,
          trigger,
        } = event.nativeEvent;
        // Read every field so the destructuring is checked, and assert the two
        // facts the types promise: a right click is button 2 and a mouse trigger.
        const position = x + y + pageX + pageY + (windowId ?? 0);
        const anyModifier = ctrlKey || shiftKey || altKey || metaKey;
        if (
          trigger === 'mouse' &&
          button === 2 &&
          anyModifier &&
          position === 0
        ) {
          throw new Error('unreachable: this file is only type-checked');
        }
      }}
      onContextMenuCapture={event => {
        const { trigger } = event.nativeEvent;
        if (trigger === 'keyboard') {
          throw new Error('unreachable: this file is only type-checked');
        }
      }}
    />
  );
}
