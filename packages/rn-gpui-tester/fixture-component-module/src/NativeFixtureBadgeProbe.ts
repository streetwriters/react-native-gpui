import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  readonly frameTicks: () => number;
  readonly propReads: () => number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FixtureBadgeProbe');
