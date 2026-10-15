import { setupDesktopTests } from '../dist/vitest-e2e.mjs';
setupDesktopTests({ keepApps: process.env.RN_GPUI_TEST_KEEP_APP === '1' });
