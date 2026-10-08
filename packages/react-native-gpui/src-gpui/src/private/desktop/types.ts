/**
 * Type additions for the desktop-shell View props (plan §8.3).
 *
 * `desktopDragRegion` and `desktopWindowControl` are parsed by
 * `HostPlatformViewProps` and listed in the GPUI `BaseViewConfig`, so Fabric
 * carries them to the renderer. React Native's own `ViewProps` does not know
 * them, so they are declared here.
 *
 * @format
 */

declare module 'react-native' {
  interface ViewProps {
    /**
     * Marks this view as part of a custom title bar: a primary press drags the
     * window and a double click zooms/minimizes it. Children that handle the
     * press themselves keep working.
     */
    desktopDragRegion?: boolean;
    /**
     * A custom caption button. Windows uses the area for snap layouts; the
     * press performs the window action everywhere.
     */
    desktopWindowControl?: 'minimize' | 'maximize' | 'close';
  }
}

export {};
