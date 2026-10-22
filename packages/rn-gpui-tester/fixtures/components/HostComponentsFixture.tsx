import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  FixtureCard,
  FixtureChart,
  FixtureMeasuredLabel,
  type FixtureChartPoint,
} from '@react-native-gpui/host-components-fixture';
import { Commands as FixtureChartCommands } from '@react-native-gpui/host-components-fixture/src/FixtureChartNativeComponent';

/**
 * Host components.
 */
const POINTS: FixtureChartPoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 4 },
  { x: 2, y: 2 },
];

const LARGE_POINTS: FixtureChartPoint[] = Array.from(
  { length: 10_000 },
  (_, index) => ({ x: index, y: Math.sin(index / 50) * 100 }),
);

export default function HostComponentsFixture({
  scenario,
}: {
  scenario?: string;
}) {
  const chart = useRef<React.ComponentRef<typeof FixtureChart> | null>(null);
  const chartHandle = () => chart.current ?? undefined;
  const [selected, setSelected] = useState<string>('none');
  const [seriesReports, setSeriesReports] = useState(0);
  const expectingReport = useRef(false);
  const [reportToken, setReportToken] = useState(0);
  const [titleCount, setTitleCount] = useState(0);

  const onPointSelected = useCallback(
    (event: { nativeEvent: { index: number; x: number; y: number } }) => {
      const { index, x, y } = event.nativeEvent;
      if (expectingReport.current) {
        expectingReport.current = false;
        setSeriesReports(count => count + 1);
      }
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
            points={scenario === 'large-series' ? LARGE_POINTS : POINTS}
            title={`Series ${titleCount}`}
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
            testID="host-chart-title"
            onPress={() => setTitleCount(count => count + 1)}
          >
            <Text style={{ color: '#f8fafc', paddingTop: 8 }}>
              change title
            </Text>
          </Pressable>
          <Pressable
            testID="host-chart-token"
            onPress={() => {
              expectingReport.current = true;
              setReportToken(token => token + 1);
            }}
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
          style={{ alignSelf: 'flex-start' }}
        />
        <Text testID="scroll-sibling" style={{ color: '#94a3b8' }}>
          next to a measured label inside a scroll view
        </Text>
        {/* Filler, so the content is taller than the 80-tall view: a scroll of a
            view that cannot scroll proves nothing about tracking. */}
        <View testID="scroll-filler" style={{ height: 400 }} />
      </ScrollView>
    </View>
  );
}
