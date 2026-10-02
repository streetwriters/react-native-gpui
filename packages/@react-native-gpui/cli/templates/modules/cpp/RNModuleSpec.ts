import { TurboModuleRegistry, type TurboModule } from "react-native";

// rn-gpui:cpp-provider create_rn_module

export interface Spec extends TurboModule {
  greet(name: string): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>("RNModule");
