import type * as React from 'react';
import {
  codegenNativeCommands,
  codegenNativeComponent,
  type CodegenTypes,
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

export interface NativeProps extends ViewProps {
  /** Sent for what GPUI reports on the card's own element. */
  onChromeEvent?: CodegenTypes.DirectEventHandler<FixtureCardChromeEvent>;
  title?: string;
  chromeHeight?: CodegenTypes.WithDefault<CodegenTypes.Double, 28>;
  chromeWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 12>;
}

export interface FixtureCardCommands {
  /** Reports `ping:<label>` as a chrome event. */
  ping: (ref: React.ComponentRef<typeof FixtureCard>, label: string) => void;
}

export const Commands = codegenNativeCommands<FixtureCardCommands>({
  supportedCommands: ['ping'],
});

const FixtureCard: any = null;

export default codegenNativeComponent<NativeProps>('FixtureCard', {
  interfaceOnly: true,
});
