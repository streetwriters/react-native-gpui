import React from 'react';
import { type ScreenId } from '../screenCatalog';
import OverviewFixture from './components/OverviewFixture';
export type ScreenProps = {
  testMode?: boolean;
  scenario?: string;
  [key: string]: unknown;
};
export const renderScreen: Record<
  ScreenId,
  (props: ScreenProps) => React.ReactNode
> = {
  overview: () => React.createElement(OverviewFixture),
  text: props =>
    React.createElement(require('./components/TextFixture').default, props),
  images: props =>
    React.createElement(require('./components/ImageFixture').default, props),
  borders: props =>
    React.createElement(require('./components/BorderFixture').default, props),
  scroll: props =>
    React.createElement(require('./components/ScrollFixture').default, props),
  press: props =>
    React.createElement(require('./components/PressFixture').default, props),
  focus: props =>
    React.createElement(require('./components/FocusFixture').default, props),
  hover: props =>
    React.createElement(require('./components/HoverFixture').default, props),
  'text-input': props =>
    React.createElement(
      require('./components/TextInputFixture').default,
      props,
    ),
  'single-line-input': props =>
    React.createElement(
      require('./components/SingleLineTextInputFixture').default,
      props,
    ),
  'input-line-height': props =>
    React.createElement(
      require('./components/TextInputLineHeightFixture').default,
      props,
    ),
  'pan-responder': props =>
    React.createElement(
      require('./components/PanResponderFixture').default,
      props,
    ),
  gestures: props =>
    React.createElement(
      require('./components/NativeGestureFixture').default,
      props,
    ),
  'gesture-tap': props =>
    React.createElement(
      require('./components/NativeGestureBasicFixture').default,
      props,
    ),
  'gesture-buttons': props =>
    React.createElement(
      require('./components/GestureButtonsFixture').default,
      props,
    ),
  'gesture-relations': props =>
    React.createElement(
      require('./components/GestureRelationsFixture').default,
      props,
    ),
  'gesture-e2e': props =>
    React.createElement(require('./components/GestureFixture').default, props),
  transforms: props =>
    React.createElement(
      require('./components/TransformFixture').default,
      props,
    ),
  'native-animated': props =>
    React.createElement(
      require('./components/NativeAnimatedFixture').default,
      props,
    ),
  reanimated: props =>
    React.createElement(require('./components/ReanimatedDemo').default, props),
  frames: props =>
    React.createElement(require('./components/FrameFixture').default, props),
  retention: props =>
    React.createElement(
      require('./components/RetentionFixture').default,
      props,
    ),
  tabs: props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'tabs',
    }),
  stack: props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'stack',
    }),
  drawer: props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'drawer',
    }),
  'native-stack': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack',
    }),
  'native-stack-hidden': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-hidden',
    }),
  'native-stack-lifecycle': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-lifecycle',
    }),
  'native-stack-native-back': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-native-back',
    }),
  'native-stack-modal': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-modal',
    }),
  'native-stack-transparent-modal': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-transparent-modal',
    }),
  'native-stack-overlay': props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'native-stack-overlay',
    }),
  nested: props =>
    React.createElement(require('./navigation/NavigationFixture').default, {
      ...props,
      scenario: 'nested',
    }),
  'rust-turbomodule': props =>
    React.createElement(
      require('./components/RustTurboModuleFixture').default,
      {
        ...props,
      },
    ),
  'cpp-turbomodule': props =>
    React.createElement(require('./components/NativeModulesFixture').default, {
      ...props,
      kind: 'cpp',
    }),
  'gpui-component': props =>
    React.createElement(
      require('./components/GpuiComponentRegistryFixture').default,
      props,
    ),
  'host-components': props =>
    React.createElement(
      require('./components/HostComponentsFixture').default,
      props,
    ),
  'fixture-module': props =>
    React.createElement(
      require('./components/FixtureModuleProbeFixture').default,
      props,
    ),
  'node-api': props =>
    React.createElement(require('./components/NativeModulesFixture').default, {
      ...props,
      kind: 'node-api',
    }),
  'node-api-packages': props =>
    React.createElement(
      require('./components/NodeAddonPackagesFixture').default,
      props,
    ),
  'native-view': props =>
    React.createElement(require('./components/NativeViewFixture').default, {
      ...props,
      webView: false,
    }),
  webview: props =>
    React.createElement(require('./components/NativeViewFixture').default, {
      ...props,
      webView: true,
    }),
  svg: props =>
    React.createElement(require('./components/SvgFixture').default, {
      ...props,
      ...(props.testMode ? { uri: 'http://127.0.0.1:43181/svg' } : {}),
    }),
  fonts: props =>
    React.createElement(require('./components/FontFixture').default, {
      ...props,
      fontSource: require('../desktop/assets/fonts/Inter-Regular.ttf'),
    }),
  networking: props =>
    React.createElement(
      require('./components/NetworkingFixture').default,
      props,
    ),
  accessibility: props =>
    React.createElement(
      require('./components/AccessibilityPropsFixture').default,
      props,
    ),
  intl: props =>
    React.createElement(require('./components/IntlFixture').default, props),
  'accessibility-tree': props =>
    React.createElement(
      require('./components/AccessibilityFixture').default,
      props,
    ),
  appearance: props =>
    React.createElement(
      require('./components/AppearanceFixture').default,
      props,
    ),
  dimensions: props =>
    React.createElement(
      require('./components/DimensionsFixture').default,
      props,
    ),
  apis: props =>
    React.createElement(require('./components/ApisFixture').default, props),
  'core-components': props =>
    React.createElement(
      require('./components/CoreComponentsFixture').default,
      props,
    ),
  'core-modules': props =>
    React.createElement(
      require('./components/CoreModulesFixture').default,
      props,
    ),
  modal: props =>
    React.createElement(require('./components/ModalFixture').default, props),
  'core-acceptance': props =>
    React.createElement(
      require('./components/Phase3AcceptanceFixture').default,
      props,
    ),
  reload: props =>
    React.createElement(require('./components/ReloadFixture').default, props),
  'desktop-shell': props =>
    React.createElement(
      require('./components/DesktopShellFixture').default,
      props,
    ),
  'window-control': props =>
    React.createElement(
      require('./components/WindowControlFixture').default,
      props,
    ),
  shortcuts: props =>
    React.createElement(
      require('./components/ShortcutsFixture').default,
      props,
    ),
  'desktop-menu': props =>
    React.createElement(
      require('./components/DesktopMenuFixture').default,
      props,
    ),
  'css-animations': props =>
    React.createElement(
      require('./components/CssAnimationsFixture').default,
      props,
    ),
  network: props =>
    React.createElement(require('./components/NetworkFixture').default, props),
  'side-borders': props =>
    React.createElement(
      require('./components/SideBordersFixture').default,
      props,
    ),
  'pointer-capture': props =>
    React.createElement(
      require('./components/PointerCaptureFixture').default,
      props,
    ),
  freeze: props =>
    React.createElement(require('./components/FreezeFixture').default, props),
  'key-events': props =>
    React.createElement(
      require('./components/KeyEventsFixture').default,
      props,
    ),
  ellipsis: props =>
    React.createElement(require('./components/EllipsisFixture').default, props),
  'props-probe': props =>
    React.createElement(
      require('./components/PropsProbeFixture').default,
      props,
    ),
  'intl-support': props =>
    React.createElement(
      require('./components/IntlSupportFixture').default,
      props,
    ),
  'text-rows': props =>
    React.createElement(require('./components/TextRowsFixture').default, props),
  'text-raster': props =>
    React.createElement(
      require('./components/TextRasterFixture').default,
      props,
    ),
  'rounded-clip': props =>
    React.createElement(
      require('./components/RoundedClipFixture').default,
      props,
    ),
  'scroll-pointer': props =>
    React.createElement(
      require('./components/ScrollPointerFixture').default,
      props,
    ),
  'reuse-under-pointer': props =>
    React.createElement(
      require('./components/ReuseUnderPointerFixture').default,
      props,
    ),
  'sortable-drag': props =>
    React.createElement(
      require('./components/SortableDragFixture').default,
      props,
    ),
  'scroll-remount': props =>
    React.createElement(
      require('./components/ScrollRemountFixture').default,
      props,
    ),
  'scroll-indicator': props =>
    React.createElement(
      require('./components/ScrollIndicatorFixture').default,
      props,
    ),
  'surface-probe': props =>
    React.createElement(
      require('./components/SurfaceProbeFixture').default,
      props,
    ),
  'native-matrix': props =>
    React.createElement(
      require('./components/NativeMatrixFixture').default,
      props,
    ),
  'native-root-load': props =>
    React.createElement(
      require('./components/NativeRootLoadFixture').default,
      props,
    ),
  'native-root': props =>
    React.createElement(
      require('./components/NativeRootFixture').default,
      props,
    ),
  'mixed-views': props =>
    React.createElement(
      require('./components/MixedViewsFixture').default,
      props,
    ),
  'gradient-snap': props =>
    React.createElement(
      require('./components/GradientSnapFixture').default,
      props,
    ),
  'long-menu': props =>
    React.createElement(require('./components/LongMenuFixture').default, props),
  'xhr-headers': props =>
    React.createElement(
      require('./components/XhrHeadersFixture').default,
      props,
    ),
  'scroll-reserve': props =>
    React.createElement(
      require('./components/ScrollReserveFixture').default,
      props,
    ),
  'menu-under-pointer': props =>
    React.createElement(
      require('./components/MenuUnderPointerFixture').default,
      props,
    ),
  'hover-rows': props =>
    React.createElement(
      require('./components/HoverRowsFixture').default,
      props,
    ),
  wheel: props =>
    React.createElement(require('./components/WheelFixture').default, props),
  'outline-radius': props =>
    React.createElement(
      require('./components/OutlineRadiusFixture').default,
      props,
    ),
  'flex-basis': props =>
    React.createElement(
      require('./components/FlexBasisFixture').default,
      props,
    ),
  'flex-basis-strict': props =>
    React.createElement(
      require('./components/FlexBasisStrictFixture').default,
      props,
    ),
  'scrollbar-drag': props =>
    React.createElement(
      require('./components/ScrollBarDragFixture').default,
      props,
    ),
  'app-shortcut': props =>
    React.createElement(
      require('./components/AppShortcutFixture').default,
      props,
    ),
  'hidden-start': props =>
    React.createElement(
      require('./components/HiddenStartFixture').default,
      props,
    ),
  stretch: props =>
    React.createElement(require('./components/StretchFixture').default, props),
  tooltip: props =>
    React.createElement(require('./components/TooltipFixture').default, props),
  app: props =>
    React.createElement(require('./components/AppFixture').default, props),
  'drag-drop': props =>
    React.createElement(require('./components/DragDropFixture').default, props),
  'file-drop': props =>
    React.createElement(require('./components/FileDropFixture').default, props),
  'state-styles': props =>
    React.createElement(
      require('./components/StateStylesFixture').default,
      props,
    ),
  'context-menu': props =>
    React.createElement(
      require('./components/ContextMenuFixture').default,
      props,
    ),
  'window-state': props =>
    React.createElement(
      require('./components/WindowStateFixture').default,
      props,
    ),
  tray: props =>
    React.createElement(require('./components/TrayFixture').default, props),
  'perf-monitor': props =>
    React.createElement(
      require('./components/PerfMonitorFixture').default,
      props,
    ),
  errors: props =>
    React.createElement(require('./components/ErrorFixture').default, props),
  logbox: props =>
    React.createElement(require('./components/LogBoxFixture').default, props),
  'benchmark-idle': props =>
    React.createElement(require('./components/BenchmarkFixture').default, {
      ...props,
      mode: 'idle',
    }),
  'benchmark-scroll': props =>
    React.createElement(require('./components/BenchmarkFixture').default, {
      ...props,
      mode: 'scroll',
    }),
  'benchmark-animate': props =>
    React.createElement(require('./components/BenchmarkFixture').default, {
      ...props,
      mode: 'animate',
    }),
};
