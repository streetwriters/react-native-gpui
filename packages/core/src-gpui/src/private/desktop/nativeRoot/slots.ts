import * as React from 'react';
import type { ViewStyle } from 'react-native';

export type SlotContent = {
  children: React.ReactNode;
  /** The width the native layout gave the slot; zero until it has. */
  width: number;
  style?: ViewStyle;
};

export type SlotApi = {
  rootId: number;
  allocate(): number;
  set(slotId: number, content: SlotContent): void;
  remove(slotId: number): void;
};

export const SlotContext = React.createContext<SlotApi | null>(null);
