import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type PdfTileStats = {
  tiles: number;
  bytes: number;
  budget: number;
  evicted: number;
};

export interface Spec extends TurboModule {
  adopt(pointer: number, width: number, height: number, stride: number): number;
  release(id: number): void;
  has(id: number): boolean;
  setBudget(bytes: number): void;
  stats(): PdfTileStats;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiPdfTiles');
