import type {TurboModule} from 'react-native';

// rn-gpui:rust-type FixtureModule
export const MODULE_NAME = 'NativeFixture';

export interface Spec extends TurboModule {
  greet(name: string): string;
}

declare const NativeFixture: Spec;
export default NativeFixture;
