import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type Summary = {
  total: number;
  label: string;
  tags: Array<string>;
};

export type SummaryOptions = {
  label?: string;
  tags: Array<string>;
};

export interface Spec extends TurboModule {
  greet(name: string): string;
  add(a: number, b: number): number;
  summarize(values: Array<number>, options: SummaryOptions): Summary;
  // Rejects with code "E_FIXTURE".
  failLater(message: string): Promise<string>;
  // Resolves with no value.
  finish(): Promise<void>;
  greetLater(name: string): Promise<string>;
  ranOffJsThread(): Promise<boolean>;
  noteJsThread(): boolean;
  // Sleeps on the module thread, then resolves the same duration.
  blockFor(ms: number): Promise<number>;
  record(value: string, tag?: string): void;
  recorded(): Array<string>;
  nextCount(): number;
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
  readonly onDone: CodegenTypes.EventEmitter<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeFixture');
