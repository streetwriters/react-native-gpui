import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isAvailable(): Promise<boolean>;
  setItem(service: string, key: string, value: string): Promise<void>;
  getItem(service: string, key: string): Promise<string | null>;
  deleteItem(service: string, key: string): Promise<boolean>;
  encryptString(service: string, plainText: string): Promise<string>;
  decryptString(service: string, encrypted: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiSecureStorage');
