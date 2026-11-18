import { useLayoutEffect, useRef, useState } from 'react';

export function report(payload: Record<string, unknown>) {
  console.log(`[bench] ${JSON.stringify({ ...payload, epoch: Date.now() })}`);
}

export function nextFrame(): Promise<number> {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/** Mulberry32: deterministic across runs and renderers. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type StepTiming = { commitMs: number; frameMs: number };

/**
 * State that resolves each change once React has committed it (layout effect)
 * and once two animation frames have passed after the commit.
 */
export function useMeasuredState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const pending = useRef<{ start: number; resolve: (commit: number) => void }>(
    null,
  );
  useLayoutEffect(() => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.resolve(performance.now());
  }, [value]);
  const set = async (next: T): Promise<StepTiming> => {
    const start = performance.now();
    const committed = new Promise<number>(resolve => {
      pending.current = { start, resolve };
    });
    setValue(next);
    const commit = await committed;
    await nextFrame();
    await nextFrame();
    return { commitMs: commit - start, frameMs: performance.now() - start };
  };
  return [value, set] as const;
}

export function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    median: at(0.5),
    p90: at(0.9),
    max: sorted[sorted.length - 1],
    mean: sum / values.length,
    total: sum,
  };
}

export function summarizeSteps(steps: StepTiming[]) {
  return {
    commitMs: summarize(steps.map(step => step.commitMs)),
    frameMs: summarize(steps.map(step => step.frameMs)),
  };
}
