/**
 * Type additions for the desktop-shell View props.
 *
 * `desktopDragRegion` and `onContextMenu` are parsed by `HostPlatformViewProps`
 * and listed in the GPUI `BaseViewConfig`, so Fabric carries them to the
 * renderer. React Native's own `ViewProps` does not know them, so they are
 * declared here.
 *
 * Caption buttons are not a View prop. A `WindowControl` component carries its own
 * hover and pressed state and its own native action, so it does not need a field
 * on every view.
 *
 * This file is published and referenced by `react-native-gpui-env.d.ts`, which
 * the CLI writes into an app's root. A module augmentation only applies when the
 * file is part of the compilation, so referencing it from the app's tsconfig
 * include set is what makes the props visible everywhere — an app should not have
 * to import the desktop entry point to write `<View desktopDragRegion>`.
 *
 * The augmentation is deliberately global: in an app shared with iOS and Android
 * these props type-check on mobile too, and do nothing there. That is so they can
 * be written anywhere without a platform check.
 *
 * @format
 */

import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

/** The native payload of a context-menu event. */
export interface DesktopContextMenuEventData {
  /** Position of the trigger, in window coordinates. */
  x: number;
  y: number;
  /** Position of the trigger, in the page's coordinates. */
  pageX: number;
  pageY: number;
  windowId?: number;
  /**
   * The button that triggered it, using the W3C numbering: 0 left, 1 middle,
   * 2 right, 3 back, 4 forward. A keyboard trigger reports 0.
   */
  button: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /**
   * How it was triggered. `keyboard` means the Menu key or Shift+F10, which only
   * Windows and Linux report; the menu is then anchored at the view's corner
   * rather than at a pointer.
   */
  trigger: 'mouse' | 'keyboard';
}

/**
 * The style properties a state style can change. A property that is being
 * animated by a native-driven animation keeps its animated value.
 */
export type DesktopStateStyle = Pick<
  ViewStyle,
  | 'backgroundColor'
  | 'opacity'
  | 'boxShadow'
  | 'transform'
  | 'borderColor'
  | 'borderLeftColor'
  | 'borderTopColor'
  | 'borderRightColor'
  | 'borderBottomColor'
> & {
  /** The color of the text inside the view. */
  color?: ColorValue;
};

/**
 * A state style that applies while the ancestor that set `group` to this name
 * is hovered or pressed.
 */
export interface DesktopGroupStateStyle {
  /** The name an ancestor sets with its `group` prop. */
  group: string;
  style: StyleProp<DesktopStateStyle>;
}

/** A file or folder dragged in from the operating system. */
export interface DesktopDroppedFile {
  /** The absolute path. */
  path: string;
  name: string;
  /** Size in bytes; `0` for a folder. */
  size: number;
  /** The media type for the extension, or an empty string when unknown. */
  type: string;
  isDirectory: boolean;
}

export interface DesktopDragEventData {
  /** The view that takes the files. */
  target: number;
  /** The pointer position in that view. */
  x: number;
  y: number;
  /** The pointer position in the page. */
  pageX: number;
  pageY: number;
  files: DesktopDroppedFile[];
}

export type DesktopDragEvent = NativeSyntheticEvent<DesktopDragEventData>;

export type DesktopContextMenuEvent =
  NativeSyntheticEvent<DesktopContextMenuEventData>;

/** Kept for the name existing code uses. */
export type ContextMenuEvent = DesktopContextMenuEvent;

declare module 'react-native' {
  interface ViewProps {
    /**
     * Marks this view as part of a custom title bar: a primary press drags the
     * window and a double click zooms/minimizes it. Children that handle the
     * press themselves keep working.
     */
    desktopDragRegion?: boolean;
    /**
     * Called when this view's context menu is requested: a right click, Ctrl +
     * click on macOS, or the Menu key / Shift+F10 on Windows and Linux.
     */
    onContextMenu?: (event: DesktopContextMenuEvent) => void;
    /**
     * The capturing counterpart. Present when either this or `onContextMenu` is
     * set, so a view with only the capture handler still receives events.
     */
    onContextMenuCapture?: (event: DesktopContextMenuEvent) => void;
    /**
     * Whether the view takes files dragged in from the operating system. The
     * nearest view under the pointer that does gets the drag events.
     */
    acceptsFiles?: boolean;
    onDragEnter?: (event: DesktopDragEvent) => void;
    onDragOver?: (event: DesktopDragEvent) => void;
    onDragLeave?: (event: DesktopDragEvent) => void;
    onDrop?: (event: DesktopDragEvent) => void;
    onDragEnterCapture?: (event: DesktopDragEvent) => void;
    onDragOverCapture?: (event: DesktopDragEvent) => void;
    onDragLeaveCapture?: (event: DesktopDragEvent) => void;
    onDropCapture?: (event: DesktopDragEvent) => void;
    /** Applied while files are dragged over this view, which must set `acceptsFiles`. */
    dragOverStyle?: StyleProp<DesktopStateStyle>;
    /** Names this view as a group that descendants style against with `groupHoverStyle` and `groupActiveStyle`. */
    group?: string;
    /** Applied while the pointer is over this view. */
    hoverStyle?: StyleProp<DesktopStateStyle>;
    /** Applied while a mouse button pressed on this view is held. */
    activeStyle?: StyleProp<DesktopStateStyle>;
    /** Applied while this view has keyboard focus. Needs a view that can take focus. */
    focusStyle?: StyleProp<DesktopStateStyle>;
    /** Applied while this view has focus and the last input was the keyboard. */
    focusVisibleStyle?: StyleProp<DesktopStateStyle>;
    /** Applied while the pointer is over the ancestor that set `group` to this name. */
    groupHoverStyle?: DesktopGroupStateStyle;
    /** Applied while a button pressed on the ancestor that set `group` to this name is held. */
    groupActiveStyle?: DesktopGroupStateStyle;
  }
}

export {};
