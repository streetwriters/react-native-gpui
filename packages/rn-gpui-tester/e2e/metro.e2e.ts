import { expect, test } from 'vitest';

test('Metro serves the GPUI tester entry and menu screens', async () => {
  const port = process.env.RN_GPUI_TEST_METRO_PORT ?? '8082';
  const response = await fetch(
    `http://localhost:${port}/index.bundle?platform=gpui&dev=false&minify=false`,
  );
  expect(response.ok).toBe(true);
  const bundle = await response.text();
  expect(bundle).toContain('React Native GPUI Tester');
  expect(bundle).toContain('tester-overview');
  expect(bundle).toContain('tester-menu-');
  expect(bundle).toContain('tester-screen-');
});
