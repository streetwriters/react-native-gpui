import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type MenuItemPatch = {
  label?: string;
  enabled?: boolean;
  checked?: boolean;
};

export type MenuDescription = {
  appName: string;
  userSet: boolean;
  items: Array<Object>;
};

export interface Spec extends TurboModule {
  menuSetApplicationMenu(items: Array<Object> | null): Promise<void>;
  menuUpdate(id: string, patch: MenuItemPatch): Promise<void>;
  menuGet(): Promise<MenuDescription>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiAppMenu');
