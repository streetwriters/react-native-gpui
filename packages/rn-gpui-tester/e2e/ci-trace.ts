import type { DesktopApp } from '@react-native-gpui/testing';

export async function traceDisplays(app: DesktopApp, label: string) {
  if (!process.env.CI) return;
  const displays = await app.displays();
  const state = await app.windowState(1);
  console.log(
    `DISPLAYTRACE ${label} displays=${JSON.stringify(displays)} window=${JSON.stringify(
      { bounds: state.bounds, scale: state.scaleFactor },
    )}`,
  );
}

export async function traceIdle(
  app: DesktopApp,
  label: string,
  durationMs = 2000,
) {
  if (!process.env.CI) return;
  const samples: string[] = [];
  const started = Date.now();
  while (Date.now() - started < durationMs) {
    const status = await app.idleStatus();
    samples.push(
      `${Date.now() - started}ms idle=${status.idle} stable=${status.stableFrames} busy=${status.busySources
        .map(source => `${source.source}(${source.detail.split('\n')[0]})`)
        .join(';')}`,
    );
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log(`IDLETRACE ${label}\n${samples.join('\n')}`);
}
