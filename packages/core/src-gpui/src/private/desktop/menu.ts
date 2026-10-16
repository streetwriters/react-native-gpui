/**
 * `Menu` — the application menu bar.
 *
 * @format
 */

import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import NativeGpuiAppMenu from '../specs/NativeGpuiAppMenu';
import { DesktopError, toDesktopError } from './index';

/** The module, or an error when the app has no desktop shell. */
function menuModule() {
  if (NativeGpuiAppMenu == null) {
    throw new DesktopError(
      'unsupported',
      'the GpuiAppMenu native module is not available',
    );
  }
  return NativeGpuiAppMenu;
}

async function request<T>(
  run: (native: typeof NativeGpuiAppMenu) => Promise<T>,
): Promise<T> {
  try {
    return await run(menuModule());
  } catch (error) {
    throw toDesktopError(error);
  }
}
import type { Subscription } from './windows';

export type MenuRole =
  | 'about'
  | 'services'
  | 'hide'
  | 'hideOthers'
  | 'showAll'
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'minimize'
  | 'zoom'
  | 'toggleFullscreen'
  | 'close'
  | 'help'
  | 'appMenu'
  | 'editMenu'
  | 'windowMenu'
  | 'helpMenu';

export type MenuItemSpec =
  | {
      type?: 'item';
      id: string;
      label: string;
      accelerator?: string;
      enabled?: boolean;
      checked?: boolean;
      role?: MenuRole;
    }
  | {
      type: 'submenu';
      id?: string;
      label: string;
      enabled?: boolean;
      items: MenuItemSpec[];
    }
  | { type: 'separator' }
  | { type: 'role'; role: MenuRole; label?: string; enabled?: boolean };

export interface MenuPressEvent {
  id: string;
  windowId: number;
}

export interface MenuItemPatch {
  label?: string;
  enabled?: boolean;
  checked?: boolean;
}

export interface MenuDescription {
  appName: string;
  userSet: boolean;
  items: MenuItemSpec[];
}

const MENU_PRESS = 'gpuiDesktop:menuPress';

export const Menu = {
  /**
   * Replace the application menu. `null` restores the default menu (app menu,
   * Edit, Window, Help).
   */
  setApplicationMenu(items: MenuItemSpec[] | null): Promise<void> {
    return request(native =>
      native.menuSetApplicationMenu(items as unknown as Object[] | null),
    );
  },

  update(id: string, patch: MenuItemPatch): Promise<void> {
    return request(native => native.menuUpdate(id, patch));
  },

  get(): Promise<MenuDescription> {
    return request(native => native.menuGet()) as Promise<MenuDescription>;
  },

  addListener(
    event: 'press',
    listener: (event: MenuPressEvent) => void,
  ): Subscription {
    if (event !== 'press') {
      throw new Error(`Menu.addListener: unknown event ${String(event)}`);
    }
    const emitter = DeviceEventEmitter.addListener(MENU_PRESS, payload => {
      listener((payload ?? {}) as MenuPressEvent);
    });
    return { remove: () => emitter.remove() };
  },
};

export interface ApplicationMenuProps {
  items: MenuItemSpec[] | null;
  onPress?: (event: MenuPressEvent) => void;
}

/**
 * Declarative menu: sets the menu on mount and on change, restores the previous
 * menu on unmount, and patches single-item changes instead of rebuilding.
 */
export function ApplicationMenu({ items, onPress }: ApplicationMenuProps) {
  const restore = React.useRef<MenuItemSpec[] | null>(null);
  const last = React.useRef<MenuItemSpec[] | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (onPress) {
      const subscription = Menu.addListener('press', onPress);
      return () => subscription.remove();
    }
    return undefined;
  }, [onPress]);

  React.useEffect(() => {
    let cancelled = false;
    Menu.get()
      .then(current => {
        if (!cancelled) {
          restore.current = current?.items ?? null;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ready) {
      return;
    }
    const previous = last.current;
    const patches =
      previous != null && items != null ? diffItems(previous, items) : null;
    if (patches) {
      for (const patch of patches) {
        Menu.update(patch.id, patch.patch);
      }
    } else {
      Menu.setApplicationMenu(items);
    }
    last.current = items;
  }, [items, ready]);

  React.useEffect(() => {
    return () => {
      Menu.setApplicationMenu(restore.current);
    };
  }, []);

  return null;
}

interface ItemPatch {
  id: string;
  patch: MenuItemPatch;
}

/**
 * When two menus have the same shape (same ids, same nesting), return the
 * per-item patches; otherwise `null` meaning "rebuild".
 */
export function diffItems(
  before: MenuItemSpec[],
  after: MenuItemSpec[],
): ItemPatch[] | null {
  const patches: ItemPatch[] = [];
  if (!diffLevel(before, after, patches)) {
    return null;
  }
  return patches;
}

function diffLevel(
  before: MenuItemSpec[],
  after: MenuItemSpec[],
  patches: ItemPatch[],
): boolean {
  if (before.length !== after.length) {
    return false;
  }
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index];
    const next = after[index];
    if (previous.type !== next.type) {
      return false;
    }
    if (previous.type === 'submenu' && next.type === 'submenu') {
      if (previous.id !== next.id || previous.label !== next.label) {
        return false;
      }
      if (!diffLevel(previous.items, next.items, patches)) {
        return false;
      }
      continue;
    }
    if (previous.type === 'separator' && next.type === 'separator') {
      continue;
    }
    const previousItem = previous as { id?: string; label?: string };
    const nextItem = next as {
      id?: string;
      label?: string;
      enabled?: boolean;
      checked?: boolean;
    };
    if (previousItem.id !== nextItem.id) {
      return false;
    }
    if (previousItem.id != null) {
      const patch: MenuItemPatch = {};
      if (previousItem.label !== nextItem.label) {
        patch.label = nextItem.label;
      }
      const beforeEnabled = (previous as { enabled?: boolean }).enabled ?? true;
      const afterEnabled = nextItem.enabled ?? true;
      if (beforeEnabled !== afterEnabled) {
        patch.enabled = afterEnabled;
      }
      const beforeChecked =
        (previous as { checked?: boolean }).checked ?? false;
      const afterChecked = nextItem.checked ?? false;
      if (beforeChecked !== afterChecked) {
        patch.checked = afterChecked;
      }
      if (Object.keys(patch).length > 0) {
        patches.push({ id: previousItem.id, patch });
      }
    }
  }
  return true;
}
