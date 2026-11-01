import {
  codegenNativeComponent,
  codegenNativeCommands,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type FixtureNativeProbeViewCountEvent = Readonly<{
  /** Views this component has created. */
  created: CodegenTypes.Int32;
  /** Of those, the ones not yet released. */
  live: CodegenTypes.Int32;
}>;

/** A plain OS view filled with one colour. */
export interface NativeProps extends ViewProps {
  /** The fill, as 0xAARRGGBB. */
  color?: CodegenTypes.Int32;
  /** Sent when core creates the OS view, on the node's first paint. */
  onAttach?: CodegenTypes.DirectEventHandler<FixtureNativeProbeViewCountEvent>;
  onViewCount?: CodegenTypes.DirectEventHandler<FixtureNativeProbeViewCountEvent>;
}

export type FixtureNativeProbeType = HostComponent<NativeProps>;

interface FixtureNativeProbeCommands {
  /** Reports how many OS views were created and how many are still alive. */
  reportViews: (viewRef: React.ElementRef<FixtureNativeProbeType>) => void;
}

export const Commands: FixtureNativeProbeCommands =
  codegenNativeCommands<FixtureNativeProbeCommands>({
    supportedCommands: ['reportViews'],
  });

export default codegenNativeComponent<NativeProps>('FixtureNativeProbe', {
  interfaceOnly: true,
});
