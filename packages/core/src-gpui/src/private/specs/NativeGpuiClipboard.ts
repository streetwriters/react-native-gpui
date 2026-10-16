/**
 * The JS-visible shape of React Native's `Clipboard`.
 *
 * React Native's own `Clipboard` module imports this spec, so the name and the
 * methods must match what it expects. `rn-gpui` implements the trait generated
 * from this file.
 *
 * @format
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  readonly getConstants: () => {};
  readonly getString: () => Promise<string>;
  readonly setString: (content: string) => void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Clipboard');
