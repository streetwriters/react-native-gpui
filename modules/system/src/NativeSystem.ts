import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(enabled: boolean, args: Array<string>): Promise<void>;
  restart(args: Array<string> | null): Promise<void>;
  setContentProtected(enabled: boolean): Promise<void>;
  isContentProtected(): Promise<boolean>;
  getIdleTime(): Promise<number>;
  setBadge(label: string | null): Promise<void>;
  getBadge(): Promise<string | null>;
  requestAttention(critical: boolean): Promise<void>;
  cancelAttention(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiSystem');
