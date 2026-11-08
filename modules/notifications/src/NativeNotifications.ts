import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NotificationActionSpec = {
  id: string;
  title: string;
  inputPlaceholder?: string | null;
  inputButtonTitle?: string | null;
};

export type NotificationSpec = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  silent?: boolean | null;
  data?: string | null;
  actions?: Array<NotificationActionSpec> | null;
};

export type TriggerSpec = {
  timestamp: number;
  repeat?: string | null;
};

export type ScheduledSpec = {
  notification: NotificationSpec;
  trigger: TriggerSpec;
};

export type EventSpec = {
  type: string;
  notification: NotificationSpec;
  actionId?: string | null;
  input?: string | null;
};

export interface Spec extends TurboModule {
  show(notification: NotificationSpec): Promise<void>;
  schedule(notification: NotificationSpec, trigger: TriggerSpec): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelScheduled(id: string | null): Promise<void>;
  cancelDisplayed(id: string | null): Promise<void>;
  cancelAll(): Promise<void>;
  getScheduled(): Promise<Array<ScheduledSpec>>;
  getDisplayed(): Promise<Array<NotificationSpec>>;
  getPermission(): Promise<string>;
  requestPermission(): Promise<string>;
  openSettings(): Promise<void>;
  getInitialEvent(): Promise<EventSpec | null>;
  readonly onEvent: CodegenTypes.EventEmitter<EventSpec>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiNotifications');
