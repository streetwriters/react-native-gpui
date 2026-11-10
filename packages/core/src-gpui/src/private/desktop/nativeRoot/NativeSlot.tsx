/**
 * Puts React Native views inside a native tree.
 *
 * ```tsx
 * <NativeRoot>
 *   <Panel>
 *     <NativeSlot>
 *       <Text>Any React Native content</Text>
 *     </NativeSlot>
 *   </Panel>
 * </NativeRoot>
 * ```
 *
 * The children are rendered by the React Native tree the `NativeRoot` is in,
 * so they keep its contexts; the contexts of the native tree reach them too.
 * They are as wide as the tree's layout makes the slot and as high as their
 * content, and the tree paints, clips and hit-tests them where the slot is.
 *
 * @format
 */

import * as React from 'react';
import { useContextBridge } from 'its-fine';
import type { ViewStyle } from 'react-native';
import { SlotContext } from './slots';

export type NativeSlotProps = {
  children?: React.ReactNode;
  /** Style for the node that holds the children, such as `{ padding: 8 }`. */
  style?: ViewStyle;
  testID?: string;
};

export function NativeSlot({ children, style, testID }: NativeSlotProps) {
  const api = React.useContext(SlotContext);
  if (api == null) {
    throw new Error('NativeSlot must be rendered inside a NativeRoot.');
  }
  const Bridge = useContextBridge();
  const [slotId] = React.useState(() => api.allocate());
  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    api.set(slotId, {
      children: <Bridge>{children}</Bridge>,
      width,
      style,
    });
  });

  React.useLayoutEffect(() => () => api.remove(slotId), [api, slotId]);

  const onSlotLayout = React.useCallback((layout: unknown) => {
    const next = (layout as { width?: number } | null)?.width;
    if (typeof next === 'number') {
      setWidth(next);
    }
  }, []);

  return React.createElement('NativeSlot', {
    slotId,
    testID,
    onSlotLayout,
  });
}
