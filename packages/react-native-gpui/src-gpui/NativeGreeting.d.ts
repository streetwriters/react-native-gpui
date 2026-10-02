import type {TurboModule} from 'react-native';

// rn-gpui:rust-type GreetingModule
export const MODULE_NAME = 'RustGreeting';

export interface Spec extends TurboModule {
  greet(name: string): string;
}

declare const NativeGreeting: Spec;
export default NativeGreeting;
