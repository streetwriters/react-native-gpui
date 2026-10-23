import {
  codegenNativeComponent,
  codegenNativeCommands,
  type CodegenTypes,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export type FixtureChartPoint = Readonly<{
  x: CodegenTypes.Double;
  y: CodegenTypes.Double;
}>;

export type FixtureChartPointSelectedEvent = Readonly<{
  index: CodegenTypes.Int32;
  x: CodegenTypes.Double;
  y: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  points?: ReadonlyArray<FixtureChartPoint>;
  title?: string;
  /** The colour of the line, as 0xAARRGGBB. */
  lineColor?: CodegenTypes.Int32;
  /** Bumped by the parent to ask the chart to report its series again. */
  reportToken?: CodegenTypes.Int32;
  onPointSelected?: CodegenTypes.DirectEventHandler<FixtureChartPointSelectedEvent>;
}

export type FixtureChartType = HostComponent<NativeProps>;

interface FixtureChartCommands {
  /** Selects a point programmatically, as a tap would. */
  selectPoint: (
    viewRef: React.ElementRef<FixtureChartType>,
    index: CodegenTypes.Int32,
  ) => void;
  /** Reports the series through the `onPointSelected` event. */
  reportSeries: (viewRef: React.ElementRef<FixtureChartType>) => void;
}

export const Commands: FixtureChartCommands =
  codegenNativeCommands<FixtureChartCommands>({
    supportedCommands: ['selectPoint', 'reportSeries'],
  });

export default codegenNativeComponent<NativeProps>('FixtureChart', {
  interfaceOnly: true,
});
