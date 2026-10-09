/**
 * `DesktopWindow` — window and title-bar control.
 *
 * Every method is a thin wrapper over the `GpuiDesktop` bridge. Methods the OS
 * cannot implement reject with `DesktopError('unsupported')`.
 *
 * @format
 */

import { DeviceEventEmitter } from 'react-native';
import { call } from './index';
import { useDesktopWindowId } from './windowContext';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  windowId: number;
  bounds: WindowBounds;
  isMaximized: boolean;
  isFullscreen: boolean;
  isFocused: boolean;
  isMinimized: boolean;
  scaleFactor: number;
}

export interface OpenWindowOptions {
  component: string;
  props?: Record<string, unknown>;
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  titleBar?: 'default' | 'transparent' | 'hidden';
  trafficLightPosition?: { x: number; y: number };
  resizable?: boolean;
  alwaysOnTop?: boolean;
  parent?: number;
}

export type WindowEventName =
  'focus' | 'blur' | 'resize' | 'move' | 'stateChange' | 'closeRequested';

export interface WindowEvent {
  windowId: number;
  [key: string]: unknown;
}

export interface Subscription {
  remove(): void;
}

const EVENT_NAMES: Record<WindowEventName, string> = {
  focus: 'gpuiDesktop:windowFocus',
  blur: 'gpuiDesktop:windowBlur',
  resize: 'gpuiDesktop:windowResize',
  move: 'gpuiDesktop:windowMove',
  stateChange: 'gpuiDesktop:windowStateChange',
  closeRequested: 'gpuiDesktop:closeRequested',
};

export class DesktopWindow {
  readonly id: number;
  readonly component: string | undefined;

  constructor(id: number, component?: string) {
    this.id = id;
    this.component = component;
  }

  /**
   * The window this component is rendered in.
   *
   * This is a hook in disguise: call it unconditionally from a component body.
   * `useDesktopWindow()` is the same thing under a hook-shaped name.
   */
  static current(): DesktopWindow {
    // `current()` is a hook in disguise: it must be called during
    // render, exactly like `useDesktopWindow()`.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return new DesktopWindow(useDesktopWindowId());
  }

  static async open(options: OpenWindowOptions): Promise<DesktopWindow> {
    const result = await call<{ windowId: number }>('window', 'open', {
      ...options,
    });
    return new DesktopWindow(result.windowId);
  }

  static async all(): Promise<DesktopWindow[]> {
    const result = await call<{
      windows: { windowId: number; component: string }[];
    }>('window', 'list');
    return result.windows.map(
      entry => new DesktopWindow(entry.windowId, entry.component),
    );
  }

  getState(): Promise<WindowState> {
    return call<WindowState>('window', 'getState', { windowId: this.id });
  }

  /**
   * Ask the host to intercept the OS close button. With a `closeRequested`
   * listener installed, the wrapper turns this on so JS can veto.
   */
  interceptClose(on: boolean): Promise<void> {
    return call<void>('window', 'interceptClose', { windowId: this.id, on });
  }

  close(options: { force?: boolean } = {}): Promise<void> {
    return call<void>('window', 'close', {
      windowId: this.id,
      force: options.force ?? false,
    });
  }

  focus(): Promise<void> {
    return call<void>('window', 'focus', { windowId: this.id });
  }

  setTitle(title: string): Promise<void> {
    return call<void>('window', 'setTitle', { windowId: this.id, title });
  }

  setSize(size: { width: number; height: number }): Promise<void> {
    return call<void>('window', 'setSize', { windowId: this.id, ...size });
  }

  setPosition(position: { x: number; y: number }): Promise<void> {
    return call<void>('window', 'setPosition', {
      windowId: this.id,
      ...position,
    });
  }

  setMinSize(size: { width: number; height: number }): Promise<void> {
    return call<void>('window', 'setMinSize', { windowId: this.id, ...size });
  }

  setMaxSize(size: { width: number; height: number }): Promise<void> {
    return call<void>('window', 'setMaxSize', { windowId: this.id, ...size });
  }

  setResizable(resizable: boolean): Promise<void> {
    return call<void>('window', 'setResizable', {
      windowId: this.id,
      value: resizable,
    });
  }

  minimize(): Promise<void> {
    return call<void>('window', 'minimize', { windowId: this.id });
  }

  maximize(): Promise<void> {
    return call<void>('window', 'maximize', { windowId: this.id });
  }

  unmaximize(): Promise<void> {
    return call<void>('window', 'unmaximize', { windowId: this.id });
  }

  toggleMaximize(): Promise<void> {
    return call<void>('window', 'toggleMaximize', { windowId: this.id });
  }

  setFullscreen(fullscreen: boolean): Promise<void> {
    return call<void>('window', 'setFullscreen', {
      windowId: this.id,
      value: fullscreen,
    });
  }

  setAlwaysOnTop(onTop: boolean): Promise<void> {
    return call<void>('window', 'setAlwaysOnTop', {
      windowId: this.id,
      value: onTop,
    });
  }

  show(): Promise<void> {
    return call<void>('window', 'show', { windowId: this.id });
  }

  hide(): Promise<void> {
    return call<void>('window', 'hide', { windowId: this.id });
  }

  startDragging(): Promise<void> {
    return call<void>('window', 'startDragging', { windowId: this.id });
  }

  addListener(
    event: WindowEventName,
    listener: (event: WindowEvent) => void,
  ): Subscription {
    const name = EVENT_NAMES[event];
    const emitter = DeviceEventEmitter.addListener(name, (payload: unknown) => {
      const value = (payload ?? {}) as WindowEvent;
      if (value.windowId === this.id) {
        listener(value);
      }
    });
    if (event === 'closeRequested') {
      this.interceptClose(true);
    }
    return {
      remove: () => {
        emitter.remove();
        if (event === 'closeRequested') {
          this.interceptClose(false);
        }
      },
    };
  }
}

export function useDesktopWindow(): DesktopWindow {
  return new DesktopWindow(useDesktopWindowId());
}
