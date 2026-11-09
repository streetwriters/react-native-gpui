import { createLocalEngine } from '@embedpdf/engine';

export * from '@embedpdf/engine';
export { createPdfRuntimeFromAddon } from './runtime';
export { createPdfRuntime, resolveRuntimeTarget } from './native-runtime';

export function createPdfEngine(
  options?: Parameters<typeof createLocalEngine>[0],
) {
  return createLocalEngine(options);
}
