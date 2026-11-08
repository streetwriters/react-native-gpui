import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type RegisterSpec = {
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  displayName: string;
  pin?: string | null;
};

export type RegisteredSpec = {
  credentialId: string;
  transports: Array<string>;
  prfEnabled: boolean;
};

export type PrfSpec = {
  rpId: string;
  credentialId: string;
  salt: string;
  pin?: string | null;
};

export type StatusSpec = {
  state: string;
};

export interface Spec extends TurboModule {
  isAvailable(): Promise<boolean>;
  register(options: RegisterSpec): Promise<RegisteredSpec>;
  getPrf(options: PrfSpec): Promise<string>;
  installSoftAuthenticator(pin: string): Promise<void>;
  removeSoftAuthenticator(): Promise<void>;
  readonly onStatus: CodegenTypes.EventEmitter<StatusSpec>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiWebauthn');
