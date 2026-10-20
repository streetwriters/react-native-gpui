/**
 * `ContextMenu` — native context menus.
 *
 * @format
 */

import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';
import NativeGpuiContextMenu from '../specs/NativeGpuiContextMenu';
import { DesktopError, toDesktopError } from './index';
import type { DesktopContextMenuEvent } from '../../../../types';

function contextMenuModule() {
  if (NativeGpuiContextMenu == null) {
    throw new DesktopError(
      'unsupported',
      'the GpuiContextMenu native module is not available',
    );
  }
  return NativeGpuiContextMenu;
}

async function request<T>(
  run: (native: typeof NativeGpuiContextMenu) => Promise<T>,
): Promise<T> {
  try {
    return await run(contextMenuModule());
  } catch (error) {
    throw toDesktopError(error);
  }
}
import type { MenuItemSpec } from './menu';

export interface ContextMenuOptions {
  x?: number;
  y?: number;
  windowId?: number;
}

export const ContextMenu = {
  /**
   * Show a menu at `options` and resolve with the chosen item id, or `null`
   * when it was dismissed.
   */
  async show(
    items: MenuItemSpec[],
    options: ContextMenuOptions = {},
  ): Promise<string | null> {
    const result = await request(native =>
      native.contextMenuShow(items as unknown as Object[], options),
    );
    return result.id ?? null;
  },
};

export interface ContextMenuViewProps extends ViewProps {
  items: MenuItemSpec[];
  onPress?: (id: string) => void;
  children?: React.ReactNode;
}

/**
 * Declarative wrapper: a secondary click on the view opens `items` and reports
 * the chosen id.
 */
export function ContextMenuView({
  items,
  onPress,
  children,
  ...viewProps
}: ContextMenuViewProps) {
  const handleContextMenu = React.useCallback(
    (event: DesktopContextMenuEvent) => {
      const { x, y, windowId } = event.nativeEvent;
      ContextMenu.show(items, { x, y, windowId })
        .then(id => {
          if (id != null) {
            onPress?.(id);
          }
        })
        .catch(() => {});
    },
    [items, onPress],
  );

  return (
    <View {...viewProps} onContextMenu={handleContextMenu}>
      {children}
    </View>
  );
}
