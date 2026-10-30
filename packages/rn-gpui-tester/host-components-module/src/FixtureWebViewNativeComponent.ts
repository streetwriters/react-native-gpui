import {
  codegenNativeComponent,
  codegenNativeCommands,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type FixtureWebViewLoadEvent = Readonly<{
  /** The HTML the view started loading. */
  html: string;
}>;

/** A web view showing an HTML string. */
export interface NativeProps extends ViewProps {
  html?: string;
  /** Sent each time the view starts loading `html`. */
  onLoadStart?: CodegenTypes.DirectEventHandler<FixtureWebViewLoadEvent>;
}

export type FixtureWebViewType = HostComponent<NativeProps>;

interface FixtureWebViewCommands {
  /** Loads `html` again. */
  reload: (viewRef: React.ElementRef<FixtureWebViewType>) => void;
}

export const Commands: FixtureWebViewCommands =
  codegenNativeCommands<FixtureWebViewCommands>({
    supportedCommands: ['reload'],
  });

export default codegenNativeComponent<NativeProps>('FixtureWebView', {
  interfaceOnly: true,
});
