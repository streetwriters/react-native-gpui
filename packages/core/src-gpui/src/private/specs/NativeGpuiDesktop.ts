/**
 * Core desktop-shell TurboModule.
 *
 * Every desktop-shell command is a method here, with the arguments and results
 * the JS API uses. `rn-gpui` implements the trait generated from this file, so
 * the two sides cannot drift, and each command runs on the GPUI main thread.
 * The public JS modules (`Menu`, `ContextMenu`, `Tray`, `DesktopWindow`,
 * `PerfMonitor`) are typed wrappers over these methods.
 *
 * Events are not typed events: the shell reports window, menu and tray activity
 * as device events (`gpuiDesktop:*`), which the wrappers subscribe to with
 * `DeviceEventEmitter`. `addListener`/`removeListeners` exist for that channel.
 *
 * The JS side only imports this file's types, so `getEnforcing` cannot throw
 * during startup.
 *
 * @format
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type DesktopCapabilities = {
  nativeAppMenu: boolean;
  nativeContextMenu: boolean;
  tray: boolean;
  trayPopoverAnchored: boolean;
  windowPosition: boolean;
  alwaysOnTop: boolean;
  transparentTitlebar: boolean;
};

export type DesktopAppInfo = {
  platform: string;
  arch: string;
  capabilities: DesktopCapabilities;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowState = {
  windowId: Int32;
  bounds: WindowBounds;
  isMaximized: boolean;
  isFullscreen: boolean;
  isFocused: boolean;
  isMinimized: boolean;
  scaleFactor: number;
};

export type WindowHandle = {
  windowId: Int32;
};

export type WindowListEntry = {
  windowId: Int32;
  component: string;
};

export type WindowList = {
  windows: Array<WindowListEntry>;
};

export type WindowTrafficLights = {
  x: number;
  y: number;
};

export type WindowOpenOptions = {
  component: string;
  props?: Object;
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  /** 'default' | 'transparent' | 'hidden'; anything else is 'default'. */
  titleBar?: string;
  trafficLightPosition?: WindowTrafficLights;
  resizable?: boolean;
  alwaysOnTop?: boolean;
};

export type MenuItemPatch = {
  label?: string;
  enabled?: boolean;
  checked?: boolean;
};

export type MenuDescription = {
  appName: string;
  userSet: boolean;
  items: Array<Object>;
};

export type ContextMenuOptions = {
  x?: number;
  y?: number;
  windowId?: Int32;
};

export type ContextMenuSelection = {
  id: string | null;
};

export interface Spec extends TurboModule {
  /** Read synchronously; these never touch the GPUI main thread. */
  capabilities(): DesktopCapabilities;
  platform(): string;
  appId(): string;

  appInfo(): Promise<DesktopAppInfo>;

  windowOpen(options: WindowOpenOptions): Promise<WindowHandle>;
  windowList(): Promise<WindowList>;
  windowGetState(windowId: Int32): Promise<WindowState>;
  windowClose(windowId: Int32, force: boolean): Promise<void>;
  windowFocus(windowId: Int32): Promise<void>;
  windowSetTitle(windowId: Int32, title: string): Promise<void>;
  windowSetSize(windowId: Int32, width: number, height: number): Promise<void>;
  windowSetPosition(windowId: Int32, x: number, y: number): Promise<void>;
  windowSetMinSize(
    windowId: Int32,
    width: number,
    height: number,
  ): Promise<void>;
  windowSetMaxSize(
    windowId: Int32,
    width: number,
    height: number,
  ): Promise<void>;
  windowSetResizable(windowId: Int32, resizable: boolean): Promise<void>;
  windowSetFullscreen(windowId: Int32, fullscreen: boolean): Promise<void>;
  windowSetAlwaysOnTop(windowId: Int32, onTop: boolean): Promise<void>;
  windowMinimize(windowId: Int32): Promise<void>;
  windowMaximize(windowId: Int32): Promise<void>;
  windowUnmaximize(windowId: Int32): Promise<void>;
  windowToggleMaximize(windowId: Int32): Promise<void>;
  windowShow(windowId: Int32): Promise<void>;
  windowHide(windowId: Int32): Promise<void>;
  windowStartDragging(windowId: Int32): Promise<void>;
  windowInterceptClose(windowId: Int32, on: boolean): Promise<void>;

  /** `null` restores the default menu. */
  menuSetApplicationMenu(items: Array<Object> | null): Promise<void>;
  menuUpdate(id: string, patch: MenuItemPatch): Promise<void>;
  menuGet(): Promise<MenuDescription>;

  contextMenuShow(
    items: Array<Object>,
    options: ContextMenuOptions,
  ): Promise<ContextMenuSelection>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiDesktop');
