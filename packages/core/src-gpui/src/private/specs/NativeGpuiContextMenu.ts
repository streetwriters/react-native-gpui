import type { Int32, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type ContextMenuOptions = {
  x?: number;
  y?: number;
  windowId?: Int32;
};

export type ContextMenuSelection = {
  id: string | null;
};

export interface Spec extends TurboModule {
  contextMenuShow(
    items: Array<Object>,
    options: ContextMenuOptions,
  ): Promise<ContextMenuSelection>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiContextMenu');
