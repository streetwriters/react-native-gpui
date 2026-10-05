import React from 'react';
import { AppRegistry } from 'react-native';
import { name } from '../app.json';

(
  globalThis as typeof globalThis & { __RN_GPUI_E2E__?: boolean }
).__RN_GPUI_E2E__ = true;
require('../../../tester/e2e/GestureFixture');
require('../../../tester/probes/PanResponderProbe');
require('../../../tester/probes/RetentionProbe');
require('../../../tester/probes/AccessibilityProbe');
require('../../../tester/e2e/AccessibilityFixture');
require('../../../tester/e2e/SingleLineTextInputFixture');
require('../../../tester/probes/AppearanceProbe');
require('../../../tester/probes/BorderProbe');
require('../../../tester/probes/ImageProbe');
require('../../../tester/probes/TextProbe');
const { FontProbe } = require('../entries/fonts');
const { SvgProbe } = require('../entries/svg');
AppRegistry.registerComponent(
  'GPUIFontProbe',
  () => (props: Record<string, unknown>) =>
    React.createElement(FontProbe, {
      ...props,
      fontSource: require('../desktop/assets/fonts/Inter-Regular.ttf'),
    }),
);
AppRegistry.registerComponent(
  'GPUISvgProbe',
  () => (props: Record<string, unknown>) =>
    React.createElement(SvgProbe, {
      ...props,
      uri: 'http://127.0.0.1:43181/svg',
    }),
);
AppRegistry.registerComponent(
  name,
  () =>
    function TestRoot(props: { scenario?: string }) {
      (
        globalThis as typeof globalThis & { __RN_GPUI_NAV_SCENARIO__?: string }
      ).__RN_GPUI_NAV_SCENARIO__ = props.scenario ?? 'stack';
      const App = require('../App').default;
      return React.createElement(App);
    },
);
