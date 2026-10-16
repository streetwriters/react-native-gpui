import type { Int32, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

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

export interface Spec extends TurboModule {
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

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiWindows');
