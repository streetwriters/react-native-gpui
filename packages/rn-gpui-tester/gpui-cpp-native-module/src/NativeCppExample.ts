import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  greet(name: string): string;
  greetLater(name: string): Promise<string>;
  // Rejects with code "E_FIXTURE".
  failLater(message: string): Promise<string>;
  ranOffJsThread(): Promise<boolean>;
  // Resolves with no value.
  finish(): Promise<void>;
  // Sleeps on the module thread, then resolves the same duration.
  blockFor(ms: number): Promise<number>;
  record(value: string, tag?: string): void;
  recorded(): Array<string>;
  lookup(key: string, callback: (value: string, found: boolean) => void): void;
  // Calls the callback on the module thread, but only for a key it finds.
  lookupLater(
    key: string,
    callback: (value: string, found: boolean) => void,
  ): Promise<string>;
  // Reads the bytes of an ArrayBuffer, and builds one.
  sum(data: ArrayBuffer): number;
  reversed(data: ArrayBuffer): ArrayBuffer;
  startProgress(steps: number): void;
  readonly onProgress: CodegenTypes.EventEmitter<number>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  tick(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCppExample');
