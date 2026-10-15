import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  loadFont(family: string, uri: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('GpuiFontLoader');
