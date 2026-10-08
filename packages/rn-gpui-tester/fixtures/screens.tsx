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
    React.createElement(require('./components/NativeModulesFixture').default, {
      ...props,
      kind: 'rust',
    }),
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
  'node-api': props =>
    React.createElement(require('./components/NativeModulesFixture').default, {
      ...props,
      kind: 'node-api',
    }),
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
  errors: props =>
    React.createElement(require('./components/ErrorFixture').default, props),
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
