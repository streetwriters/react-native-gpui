/**
 * `ContextMenu` — native context menus.
 *
 * @format
 */

import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';
import { call } from './index';
import type { MenuItemSpec } from './menu';

export interface ContextMenuOptions {
  x?: number;
  y?: number;
  windowId?: number;
}

export interface ContextMenuEvent {
  nativeEvent: {
    x: number;
    y: number;
    pageX: number;
    pageY: number;
    windowId?: number;
  };
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
    const result = await call<{ id: string | null }>('contextMenu', 'show', {
      items,
      ...options,
    });
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
    (event: ContextMenuEvent) => {
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
