import { Dimensions } from 'react-native';
import { useEffect, useState } from 'react';
import {
  MAIN_WINDOW_ID,
  useDesktopWindowId,
  useWindowState,
} from '@react-native-gpui/core/desktop';

// The main window is what `Dimensions` describes. Any other window reports its
// own size and scale from its window state, with the system font scale.
function useMainWindowDimensions() {
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    function handleChange({ window }) {
      if (
        dimensions.width !== window.width ||
        dimensions.height !== window.height ||
        dimensions.scale !== window.scale ||
        dimensions.fontScale !== window.fontScale
      ) {
        setDimensions(window);
      }
    }
    const subscription = Dimensions.addEventListener('change', handleChange);
    handleChange({ window: Dimensions.get('window') });
    return () => {
      subscription.remove();
    };
  }, [dimensions]);
  return dimensions;
}

export default function useWindowDimensions() {
  const windowId = useDesktopWindowId();
  const main = useMainWindowDimensions();
  const state = useWindowState();
  if (windowId === MAIN_WINDOW_ID || state == null) {
    return main;
  }
  return {
    width: state.bounds.width,
    height: state.bounds.height,
    scale: state.scaleFactor,
    fontScale: main.fontScale,
  };
}
