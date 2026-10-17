import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type TraySize = {
  width: number;
  height: number;
};

export type TrayOptions = {
  id?: string;
  tooltip?: string;
  title?: string;
  component?: string;
  size?: TraySize;
  menu?: Array<Object>;
  menuOnLeftClick?: boolean;
  quitOnLastWindowClosed?: boolean;
};

export type TrayHandle = {
  id: string;
};

export type TrayState = {
  installed: boolean;
  id?: string;
  tooltip?: string | null;
  visible?: boolean;
  component?: string | null;
  popover?: number | null;
  clicks?: number;
  hasMenu?: boolean;
  menuItems?: Array<Object>;
};

export interface Spec extends TurboModule {
  trayInstall(options: TrayOptions): Promise<TrayHandle>;
  trayDestroy(): Promise<void>;
  trayGetState(): Promise<TrayState>;
  traySetTooltip(tooltip: string | null): Promise<void>;
  traySetVisible(visible: boolean): Promise<void>;
  traySetIcon(path: string): Promise<void>;
  traySetMenu(items: Array<Object> | null): Promise<void>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiTray');
