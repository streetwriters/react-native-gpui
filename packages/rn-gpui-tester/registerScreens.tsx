import React from 'react';
import { AppRegistry } from 'react-native';
import TesterApp from './App';
import { screens } from './screenCatalog';
import { renderScreen, type ScreenProps } from './fixtures/screens';

export function registerScreens(testMode = false) {
  AppRegistry.registerComponent(
    'RNGPUITester',
    () => (props: { screen?: string }) => (
      <TesterApp {...props} testMode={testMode} />
    ),
  );
  for (const screen of screens) {
    AppRegistry.registerComponent(`RNGPUITester--${screen.id}`, () => () => (
      <TesterApp screen={screen.id} testMode={testMode} />
    ));
    if (screen.fixture !== 'NavigationFixture') {
      AppRegistry.registerComponent(
        screen.fixture,
        () => (props: ScreenProps) => (
          <>{renderScreen[screen.id]({ ...props, testMode })}</>
        ),
      );
    }
  }
  AppRegistry.registerComponent(
    'NavigationFixture',
    () => (props: ScreenProps) =>
      React.createElement(
        require('./fixtures/navigation/NavigationFixture').default,
        { ...props, testMode },
      ),
  );
  AppRegistry.registerComponent(
    'GPUIFontFixture',
    () => (props: ScreenProps) => (
      <>{renderScreen.fonts({ ...props, testMode })}</>
    ),
  );
  AppRegistry.registerComponent(
    'GPUISvgFixture',
    () => (props: ScreenProps) => (
      <>{renderScreen.svg({ ...props, testMode })}</>
    ),
  );
  // The component the tray popover runs (plan 7.3).
  AppRegistry.registerComponent(
    'TrayPopover',
    () => (props: { windowId?: number }) =>
      React.createElement(
        require('./fixtures/components/TrayFixture').TrayPopover,
        props,
      ),
  );
  // The component a secondary desktop window runs (plan 7.4).
  AppRegistry.registerComponent(
    'DesktopShellChild',
    () => (props: { windowId?: number; label?: string }) =>
      React.createElement(
        require('./fixtures/components/DesktopShellChild').default,
        props,
      ),
  );
}
