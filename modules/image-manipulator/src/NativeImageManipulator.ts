import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  manipulate(
    uri: string,
    actions: Array<CodegenTypes.UnsafeObject>,
    options: CodegenTypes.UnsafeObject,
  ): Promise<CodegenTypes.UnsafeObject>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiImageManipulator');
