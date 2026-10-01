// GPUI provides keyboard events through its focus system, so register the
// desktop events with Fabric before the app creates its first native view.
const viewConfigRegistry = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');

viewConfigRegistry.customBubblingEventTypes.topKeyDown = {
  phasedRegistrationNames: {
    bubbled: 'onKeyDown',
    captured: 'onKeyDownCapture',
  },
};
viewConfigRegistry.customBubblingEventTypes.topKeyUp = {
  phasedRegistrationNames: {
    bubbled: 'onKeyUp',
    captured: 'onKeyUpCapture',
  },
};

module.exports = require('react-native');
