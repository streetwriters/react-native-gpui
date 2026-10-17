import { expect, test } from 'vitest';

// The whole tester bundle is several megabytes and Metro has to bundle it on
// first request, which in a parallel run competes with the app processes for
// the machine. The default 60 s budget is not enough for that first request on
// a slower host, so this gets a longer one; the assertion is unchanged.
test('Metro serves the GPUI tester entry and menu screens', async () => {
  const port = process.env.RN_GPUI_TEST_METRO_PORT ?? '8082';
  const response = await fetch(
    `http://localhost:${port}/index.bundle?platform=desktop&dev=false&minify=false`,
  );
  expect(response.ok).toBe(true);
  const bundle = await response.text();
  expect(bundle).toContain('React Native GPUI Tester');
  expect(bundle).toContain('tester-overview');
  expect(bundle).toContain('tester-menu-');
  expect(bundle).toContain('tester-screen-');
}, 180_000);
