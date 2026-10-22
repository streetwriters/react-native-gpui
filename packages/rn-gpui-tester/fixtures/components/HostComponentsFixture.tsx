import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  FixtureCard,
  FixtureChart,
  FixtureMeasuredLabel,
  type FixtureChartPoint,
} from '@react-native-gpui/host-components-fixture';
// From the spec, not the package index: `Commands` is reserved by the codegen
// plugin and cannot be re-exported.
import { Commands as FixtureChartCommands } from '@react-native-gpui/host-components-fixture/src/FixtureChartNativeComponent';

/**
 * Host components (design 2, section 5.1 and 6.1).
 *
 * One screen exercising everything the host component API promises:
 *
 * * `FixtureChart` receives props (points, title, colour), runs commands
 *   (`selectPoint`, `reportSeries`) and emits an event JS receives
 *   (`onPointSelected`).
 * * `FixtureMeasuredLabel` measures itself and reports a size through Fabric
 *   state, so its parent lays out around it one commit later.
 * * `FixtureCard` is a container: it draws chrome and reports the room that
 *   chrome takes, so React children land inside it.
 *
 * The `scenario` prop always measures the same numbers so the e2e test can
 * assert exact geometry rather than "something happened".
 */
const POINTS: FixtureChartPoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 4 },
  { x: 2, y: 2 },
];

export default function HostComponentsFixture({
  scenario,
}: {
  scenario?: string;
}) {
  const chart = useRef<React.ComponentRef<typeof FixtureChart> | null>(null);
  // `codegenNativeCommands` takes the resolved handle; guard so a press before
  // the native view exists is a no-op rather than a throw.
  const chartHandle = () => chart.current ?? undefined;
  const [selected, setSelected] = useState<string>('none');
  const [seriesReports, setSeriesReports] = useState(0);
  // `reportSeries` answers through the same `pointSelected` event, so a press of
  // the report button sets this before the command runs and the handler reads it
  // to tell a report from a selection.
  const expectingReport = useRef(false);
  const [reportToken, setReportToken] = useState(0);

  const onPointSelected = useCallback(
    (event: { nativeEvent: { index: number; x: number; y: number } }) => {
      const { index, x, y } = event.nativeEvent;
      if (expectingReport.current) {
        expectingReport.current = false;
        setSeriesReports(count => count + 1);
      }
      // `reportSeries` answers through this same event, so the selection text
      // records the last reported point either way.
      setSelected(`index=${index} x=${x} y=${y}`);
    },
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0b1220' }}>
      <View testID="host-components-header" style={{ padding: 12 }}>
        <Text style={{ color: '#e2e8f0', fontSize: 16 }}>
          Host components ({scenario ?? 'default'})
        </Text>
        <Text testID="host-components-selected" style={{ color: '#93c5fd' }}>
          selected: {selected}
        </Text>
        <Text testID="host-components-series" style={{ color: '#93c5fd' }}>
          series reports: {seriesReports}
        </Text>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', padding: 12, gap: 12 }}>
        {/* A GPUI-element component with props, an event and commands. */}
        <View style={{ width: 240 }}>
          <FixtureChart
            ref={chart}
            testID="host-chart"
            points={POINTS}
            title="Series"
            lineColor={0xff2563eb}
            reportToken={reportToken}
            onPointSelected={onPointSelected}
            style={{ width: 240, height: 120 }}
          />
          <Pressable
            testID="host-chart-select"
            onPress={() => {
              const handle = chartHandle();
              if (handle) FixtureChartCommands.selectPoint(handle, 2);
            }}
          >
            <Text style={{ color: '#f8fafc', paddingTop: 8 }}>
              select point 2
            </Text>
          </Pressable>
          <Pressable
            testID="host-chart-report"
            onPress={() => {
              const handle = chartHandle();
              if (handle) {
                expectingReport.current = true;
                FixtureChartCommands.reportSeries(handle);
              }
            }}
          >
            <Text style={{ color: '#f8fafc', paddingTop: 8 }}>
              report series
            </Text>
          </Pressable>
          <Pressable
            testID="host-chart-token"
            onPress={() => setReportToken(token => token + 1)}
          >
            <Text style={{ color: '#f8fafc', paddingTop: 8 }}>
              bump report token
            </Text>
          </Pressable>
        </View>

        {/* A measured component: its size comes from its own content, and this
            parent lays out after it rather than forcing a size. */}
        <View testID="measured-column" style={{ flexDirection: 'column' }}>
          <FixtureMeasuredLabel
            testID="host-measured"
            text="abcd"
            characterWidth={10}
            lineHeight={20}
            // A column stretches its children across the axis by default, which
            // would hide the reported width behind the container's. `flex-start`
            // keeps the measured width visible.
            style={{ alignSelf: 'flex-start' }}
          />
          <Text
            testID="measured-sibling"
            style={{ color: '#fca5a5', paddingTop: 4 }}
          >
            below the measured label
          </Text>
        </View>

        {/* A container: chrome around React children, with the chrome reported
            as insets so the children clear it. */}
        <FixtureCard
          testID="host-card"
          title="Card"
          chromeHeight={28}
          chromeWidth={12}
          style={{ width: 200, height: 160 }}
        >
          <Text testID="card-child" style={{ color: '#f8fafc' }}>
            inside the card
          </Text>
        </FixtureCard>
      </View>

      {/* A measured component inside a scroll view: it must keep tracking while
          the view scrolls, which is what the scroll strategy protects. */}
      <ScrollView
        testID="host-scroll"
        style={{ height: 80 }}
        contentContainerStyle={{ padding: 8 }}
      >
        <FixtureMeasuredLabel
          testID="host-measured-in-scroll"
          text="scroll"
          characterWidth={9}
          lineHeight={18}
        />
        <Text testID="scroll-sibling" style={{ color: '#94a3b8' }}>
          next to a measured label inside a scroll view
        </Text>
      </ScrollView>
    </View>
  );
}
