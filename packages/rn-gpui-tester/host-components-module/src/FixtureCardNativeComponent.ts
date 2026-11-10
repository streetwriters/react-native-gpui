import type * as React from 'react';
import {
  codegenNativeCommands,
  codegenNativeComponent,
  type CodegenTypes,
  type ImageSource,
  type ViewProps,
} from 'react-native';

/**
 * A container host component: it draws a GPUI card
 * around its React children and reports the room its own chrome takes, so the
 * children are laid out inside what is left rather than under the title bar.
 */
export type FixtureCardChromeEvent = Readonly<{
  /** `click`, `down`, `up`, `hover-in` or `hover-out`. */
  kind: string;
}>;

/** What `reportDetails` reports about the props that are not scalars. */
export type FixtureCardDetailsEvent = Readonly<{
  mode: 'compact' | 'roomy';
  icon: string;
  tags: string[];
  sizes: CodegenTypes.Double[];
  nested: Readonly<{ flag: boolean; count: CodegenTypes.Int32 }>;
}>;

export interface NativeProps extends ViewProps {
  /** Sent for what GPUI reports on the card's own element. */
  onChromeEvent?: CodegenTypes.DirectEventHandler<FixtureCardChromeEvent>;
  title?: string;
  chromeHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 28>;
  chromeWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 12>;
  mode?: CodegenTypes.WithDefault<'compact' | 'roomy', 'compact'>;
  badge?: Readonly<{ label: string; level: CodegenTypes.Int32 }>;
  labels?: ReadonlyArray<string>;
  items?: ReadonlyArray<Readonly<{ name: string; size: CodegenTypes.Double }>>;
  icon?: ImageSource;
  /** Sent by `reportDetails`. */
  onDetails?: CodegenTypes.DirectEventHandler<FixtureCardDetailsEvent>;
}

export interface FixtureCardCommands {
  /** Reports `ping:<label>` as a chrome event. */
  ping: (ref: React.ComponentRef<typeof FixtureCard>, label: string) => void;
  /** Reports what the card read from its non-scalar props as `onDetails`. */
  reportDetails: (ref: React.ComponentRef<typeof FixtureCard>) => void;
}

export const Commands = codegenNativeCommands<FixtureCardCommands>({
  supportedCommands: ['ping', 'reportDetails'],
});

const FixtureCard: any = null;

export default codegenNativeComponent<NativeProps>('FixtureCard', {
  interfaceOnly: true,
});
