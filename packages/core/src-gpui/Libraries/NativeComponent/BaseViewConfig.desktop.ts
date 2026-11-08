// RN's mobile base configs split accessibility props by OS. Desktop supports
// both sets, so do not silently drop Android-originated props on macOS.
// There is no public React Native export for BaseViewConfig.
// eslint-disable-next-line @react-native/no-deep-imports
import iosConfig from 'react-native/Libraries/NativeComponent/BaseViewConfig.ios';
// eslint-disable-next-line @react-native/no-deep-imports
import flattenStyle from 'react-native/Libraries/StyleSheet/flattenStyle';
// eslint-disable-next-line @react-native/no-deep-imports
import processBoxShadow from 'react-native/Libraries/StyleSheet/processBoxShadow';
// eslint-disable-next-line @react-native/no-deep-imports
import processColor from 'react-native/Libraries/StyleSheet/processColor';

const STATE_STYLE_PROPS = new Set(['backgroundColor', 'opacity', 'boxShadow']);
const warned = new Set<string>();

function warnOnce(message: string) {
  if (__DEV__ && !warned.has(message)) {
    warned.add(message);
    console.warn(message);
  }
}

// A state style crosses to native as JSON text with colors already resolved, so
// Fabric only diffs and forwards a string.
function stateStyleObject(prop: string, style: unknown) {
  const flat = flattenStyle(style);
  const out: Record<string, unknown> = {};
  if (!flat) {
    return out;
  }
  for (const key of Object.keys(flat)) {
    const value = flat[key];
    if (value == null) {
      continue;
    }
    if (!STATE_STYLE_PROPS.has(key)) {
      warnOnce(`${prop} does not support the style property "${key}".`);
    } else if (key === 'backgroundColor') {
      const color = processColor(value);
      if (typeof color === 'number') {
        out.backgroundColor = color;
      } else {
        warnOnce(`${prop} supports plain colors in backgroundColor only.`);
      }
    } else if (key === 'opacity') {
      out.opacity = value;
    } else {
      out.boxShadow = processBoxShadow(value).map(shadow => ({
        ...shadow,
        color: shadow.color == null ? undefined : processColor(shadow.color),
      }));
    }
  }
  return out;
}

function processStateStyle(prop: string) {
  return (style: unknown) => JSON.stringify(stateStyleObject(prop, style));
}

function processGroupStateStyle(prop: string) {
  return (value: { group?: unknown; style?: unknown } | null) => {
    if (value == null) {
      return '';
    }
    if (typeof value.group !== 'string' || value.group === '') {
      warnOnce(`${prop} needs a group name: { group: 'name', style: {...} }.`);
      return '';
    }
    return JSON.stringify({
      group: value.group,
      style: stateStyleObject(prop, value.style),
    });
  };
}

export default {
  ...iosConfig,
  // A native `topContextMenu` event reaches the view's `onContextMenu` handler
  //. It is registered the same way RN registers `onPointerEnter`
  // (a bubbling event plus a `validAttributes` marker), because Fabric converts
  // the JS handler function into the boolean marker that creates the listener.
  bubblingEventTypes: {
    ...iosConfig.bubblingEventTypes,
    topContextMenu: {
      phasedRegistrationNames: {
        bubbled: 'onContextMenu',
        captured: 'onContextMenuCapture',
      },
    },
  },
  validAttributes: {
    ...iosConfig.validAttributes,
    accessibilityLabelledBy: true,
    accessibilityLiveRegion: true,
    importantForAccessibility: true,
    focusable: true,
    desktopDragRegion: true,
    group: true,
    hoverStyle: { process: processStateStyle('hoverStyle') },
    activeStyle: { process: processStateStyle('activeStyle') },
    focusStyle: { process: processStateStyle('focusStyle') },
    focusVisibleStyle: { process: processStateStyle('focusVisibleStyle') },
    groupHoverStyle: { process: processGroupStateStyle('groupHoverStyle') },
    groupActiveStyle: { process: processGroupStateStyle('groupActiveStyle') },
    onContextMenu: true,
    onContextMenuCapture: true,
    // RN omits iOS listener flags when Platform.OS is an out-of-tree platform.
    // Fabric's AccessibilityProps needs these flags for native action routing.
    onAccessibilityAction: true,
    onAccessibilityEscape: true,
    onAccessibilityTap: true,
  },
};
