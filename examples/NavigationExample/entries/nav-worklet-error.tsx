import { scheduleOnUI } from 'react-native-worklets';
require('../registerNavigation');
setTimeout(() => {
  scheduleOnUI(() => {
    'worklet';
    throw new Error('GPUI frame exception regression');
  });
}, 1000);
setTimeout(() => console.log('[nav-error] JS remains alive'), 3000);
