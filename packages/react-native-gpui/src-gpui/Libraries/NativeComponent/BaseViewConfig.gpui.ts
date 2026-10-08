// RN's mobile base configs split accessibility props by OS. Desktop supports
// both sets, so do not silently drop Android-originated props on macOS.
// There is no public React Native export for BaseViewConfig.
// eslint-disable-next-line @react-native/no-deep-imports
import iosConfig from 'react-native/Libraries/NativeComponent/BaseViewConfig.ios';

export default {
  ...iosConfig,
  validAttributes: {
    ...iosConfig.validAttributes,
    accessibilityLabelledBy: true,
    accessibilityLiveRegion: true,
    importantForAccessibility: true,
    focusable: true,
    // Desktop shell window props (plan §8.3). Fabric carries them through
    // HostPlatformViewProps to `RNNodeView`.
    desktopDragRegion: true,
    desktopWindowControl: true,
    // RN omits iOS listener flags when Platform.OS is an out-of-tree platform.
    // Fabric's AccessibilityProps needs these flags for native action routing.
    onAccessibilityAction: true,
    onAccessibilityEscape: true,
    onAccessibilityTap: true,
  },
};
