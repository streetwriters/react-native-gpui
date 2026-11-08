import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type UpdaterOptions = {
  feedUrl: string;
  channel: string;
  currentVersion?: string | null;
  allowDowngrade: boolean;
};

export type UpdateInfo = {
  version: string;
  releaseDate?: string | null;
  size: number;
};

export type UpdaterEvent = {
  type: string;
  version?: string | null;
  percent?: number | null;
  transferred?: number | null;
  total?: number | null;
  bytesPerSecond?: number | null;
  message?: string | null;
};

export interface Spec extends TurboModule {
  configure(options: UpdaterOptions): void;
  getCurrentVersion(): Promise<string>;
  checkForUpdates(): Promise<UpdateInfo | null>;
  downloadUpdate(): Promise<string>;
  cancelDownload(): boolean;
  installUpdate(): Promise<void>;
  readonly onUpdaterEvent: CodegenTypes.EventEmitter<UpdaterEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiUpdater');
