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

export type FixtureWebViewLoadedEvent = Readonly<{
  /** The address the view finished loading. */
  url: string;
}>;

/** A web view showing an HTML string. */
export interface NativeProps extends ViewProps {
  html?: string;
  /** Sent each time the view starts loading `html`. */
  onLoadStart?: CodegenTypes.DirectEventHandler<FixtureWebViewLoadEvent>;
  /** Sent when the web view reports that navigation finished. */
  onLoad?: CodegenTypes.DirectEventHandler<FixtureWebViewLoadedEvent>;
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
