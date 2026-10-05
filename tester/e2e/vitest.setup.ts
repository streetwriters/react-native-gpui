import { setupDesktopTests } from '@react-native-gpui/testing/vitest-e2e';
setupDesktopTests({ keepApps: process.env.RN_GPUI_TEST_KEEP_APP === '1' });
