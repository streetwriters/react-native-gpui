/**
 * The React context that tells a window's JS which window it is (plan §3.3).
 *
 * `AppRegistry` renders the app's root component with the surface's
 * `initialProps`, and the host passes `windowId` in them. A wrapper component
 * installed through RN's public `setWrapperComponentProvider` turns that into a
 * context value, so `DesktopWindow.current()` needs no global mutable state
 * (which would be unsafe with two windows rendering in one JS runtime).
 *
 * @format
 */

import React, { createContext, useContext } from 'react';
import { AppRegistry } from 'react-native';

/** The main window is always `1`. */
export const MAIN_WINDOW_ID = 1;

export const DesktopWindowContext = createContext<number>(MAIN_WINDOW_ID);

/** The window id of the component that calls this. */
export function useDesktopWindowId(): number {
  return useContext(DesktopWindowContext);
}

let installed = false;

/**
 * Install the `AppRegistry` wrapper that provides [`DesktopWindowContext`].
 * Idempotent; called once from the platform entry point.
 */
export function installDesktopWindowContext(): void {
  if (installed) {
    return;
  }
  installed = true;
  AppRegistry.setWrapperComponentProvider(() => {
    function DesktopWindowWrapper(props: {
      initialProps?: { windowId?: number };
      children?: React.ReactNode;
    }) {
      const raw = props?.initialProps?.windowId;
      const windowId =
        typeof raw === 'number' && raw > 0 ? raw : MAIN_WINDOW_ID;
      return React.createElement(
        DesktopWindowContext.Provider,
        { value: windowId },
        props.children,
      );
    }
    return DesktopWindowWrapper;
  });
}
