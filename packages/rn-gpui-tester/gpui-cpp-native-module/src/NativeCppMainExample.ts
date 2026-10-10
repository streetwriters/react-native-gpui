import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  ranOnMainThread(): Promise<boolean>;
  // Runs on the GPUI main thread and emits onDone, which carries no payload.
  notify(): void;
  readonly onDone: CodegenTypes.EventEmitter<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCppMainExample');
