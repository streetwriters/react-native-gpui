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
    AppRegistry.registerComponent(
      screen.fixture,
      () => (props: ScreenProps) => (
        <>{renderScreen[screen.id]({ ...props, testMode })}</>
      ),
    );
  }
  AppRegistry.registerComponent(
    'E2EProbesFixture',
    () => () =>
      React.createElement(
        require('./fixtures/components/E2EProbesFixture').default,
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
    'EmbeddedPanel',
    () => (props: { name?: string }) =>
      React.createElement(
        require('./fixtures/components/EmbeddedSurfaceFixtures').EmbeddedPanel,
        props,
      ),
  );
  AppRegistry.registerComponent(
    'EmbeddedFit',
    () => (props: { name?: string }) =>
      React.createElement(
        require('./fixtures/components/EmbeddedSurfaceFixtures').EmbeddedFit,
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
