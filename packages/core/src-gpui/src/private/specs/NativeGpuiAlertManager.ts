/**
 * The JS-visible shape of React Native's `AlertManager`.
 *
 * React Native's own `Alert` module imports this spec, so the name and the
 * method signature must match what it expects. `rn-gpui` implements the trait
 * generated from this file.
 *
 * @format
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type AlertArgs = {
  title?: string;
  message?: string;
  buttons?: Array<Object>;
  type?: string;
  defaultValue?: string;
  cancelButtonKey?: string;
  destructiveButtonKey?: string;
  preferredButtonKey?: string;
  keyboardType?: string;
  userInterfaceStyle?: string;
};

export interface Spec extends TurboModule {
  readonly alertWithArgs: (
    args: AlertArgs,
    callback: (id: number, value: string) => void,
  ) => void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AlertManager');
