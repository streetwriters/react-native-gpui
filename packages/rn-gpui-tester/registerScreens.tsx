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
  AppRegistry.registerComponent(
    'GPUIFileSystemFixture',
    () => (props: ScreenProps) =>
      // Not in the screen catalog: only the e2e launches it, by this name.
      React.createElement(
        require('./fixtures/components/FileSystemFixture').FileSystemFixture,
        { ...props, testMode },
      ),
  );
  AppRegistry.registerComponent(
    'TrayPopover',
    () => (props: { windowId?: number }) =>
      React.createElement(
        require('./fixtures/components/TrayFixture').TrayPopover,
        props,
      ),
  );
  AppRegistry.registerComponent(
    'DesktopShellChild',
    () => (props: { windowId?: number; label?: string }) =>
      React.createElement(
        require('./fixtures/components/DesktopShellChild').default,
        props,
      ),
  );
}
