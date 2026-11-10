import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { CodegenTypes } from 'react-native';

export interface Spec extends TurboModule {
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(enabled: boolean, args: Array<string>): Promise<void>;
  restart(args: Array<string> | null): Promise<void>;
  setContentProtected(enabled: boolean): Promise<void>;
  isContentProtected(): Promise<boolean>;
  setJumpList(tasks: Array<CodegenTypes.UnsafeObject>): Promise<void>;
  getIdleTime(): Promise<number>;
  setBadge(label: string | null): Promise<void>;
  getBadge(): Promise<string | null>;
  requestAttention(critical: boolean): Promise<void>;
  cancelAttention(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiSystem');
