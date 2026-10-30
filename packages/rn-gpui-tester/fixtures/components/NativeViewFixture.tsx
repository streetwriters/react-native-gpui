import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  FixtureNativeProbe,
  FixtureWebView,
  type FixtureNativeProbeType,
  type FixtureWebViewType,
} from '@react-native-gpui/host-components-fixture';
import { Commands as FixtureNativeProbeCommands } from '@react-native-gpui/host-components-fixture/src/FixtureNativeProbeNativeComponent';
import { Commands as FixtureWebViewCommands } from '@react-native-gpui/host-components-fixture/src/FixtureWebViewNativeComponent';

const BLUE = 0xff147aad;
const ORANGE = 0xffe8743b;
const PAGE_ONE =
  "<html><body style='background:#153b59;color:white;font:24px system-ui'><h1>One</h1></body></html>";
const PAGE_TWO =
  "<html><body style='background:#59153b;color:white;font:24px system-ui'><h1>Two</h1></body></html>";

function Button({
  testID,
  label,
  onPress,
}: {
  testID: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        padding: 10,
        backgroundColor: '#5865f2',
        borderRadius: 8,
      }}
    >
      <Text style={{ color: '#fff' }}>{label}</Text>
    </Pressable>
  );
}

export default function NativeViewFixture({
  webView = false,
}: {
  webView?: boolean;
}) {
  const [overlay, setOverlay] = useState(false);
  const [underlay, setUnderlay] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [orange, setOrange] = useState(false);
  const [second, setSecond] = useState(false);
  const [counts, setCounts] = useState('no report');
  const [events, setEvents] = useState<string[]>([]);
  const probe = useRef<React.ElementRef<FixtureNativeProbeType>>(null);
  const web = useRef<React.ElementRef<FixtureWebViewType>>(null);

  const nativeStyle = hidden
    ? ({
        flex: 1,
        backfaceVisibility: 'hidden',
        transform: [{ rotateY: '180deg' }],
      } as const)
    : ({ flex: 1 } as const);
  const nativeView = webView ? (
    <FixtureWebView
      ref={web}
      testID="native-view-host"
      html={second ? PAGE_TWO : PAGE_ONE}
      onLoadStart={() => setEvents(log => [...log, 'start'])}
      onLoad={() => setEvents(log => [...log, 'load'])}
      style={nativeStyle}
    />
  ) : (
    <FixtureNativeProbe
      ref={probe}
      testID="native-view-host"
      color={orange ? ORANGE : BLUE}
      onViewCount={event => {
        const { created, live } = event.nativeEvent;
        setCounts(`created ${created} live ${live}`);
      }}
      style={nativeStyle}
    />
  );

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#171923' }}>
      <Text style={{ fontSize: 24, color: '#fff' }}>
        {webView ? 'Web view composition' : 'Native view composition'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          testID="native-overlay-toggle"
          label={overlay ? 'Hide overlay' : 'Show overlay'}
          onPress={() => setOverlay(value => !value)}
        />
        <Button
          testID="native-underlay-toggle"
          label={underlay ? 'Hide underlay' : 'Show underlay'}
          onPress={() => setUnderlay(value => !value)}
        />
        <Button
          testID="native-mount-toggle"
          label={mounted ? 'Unmount' : 'Mount'}
          onPress={() => setMounted(value => !value)}
        />
        <Button
          testID="native-hide-toggle"
          label={hidden ? 'Show' : 'Hide'}
          onPress={() => setHidden(value => !value)}
        />
        <Button
          testID="native-scroll-toggle"
          label={scrolled ? 'Unscroll' : 'Scroll'}
          onPress={() => setScrolled(value => !value)}
        />
        {webView ? (
          <>
            <Button
              testID="native-page-toggle"
              label="Other page"
              onPress={() => setSecond(value => !value)}
            />
            <Button
              testID="native-reload"
              label="Reload"
              onPress={() =>
                web.current && FixtureWebViewCommands.reload(web.current)
              }
            />
          </>
        ) : (
          <>
            <Button
              testID="native-color-toggle"
              label="Change colour"
              onPress={() => setOrange(value => !value)}
            />
            <Button
              testID="native-report"
              label="Report views"
              onPress={() =>
                probe.current &&
                FixtureNativeProbeCommands.reportViews(probe.current)
              }
            />
          </>
        )}
      </View>
      <Text testID="native-status" style={{ color: '#fff' }}>
        {webView ? events.join(',') : counts}
      </Text>
      <View testID="native-area" style={{ flex: 1 }}>
        {underlay ? (
          <View
            testID="native-view-underlay"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 200,
              height: 60,
              backgroundColor: '#22c55e',
            }}
          />
        ) : null}
        {mounted ? (
          scrolled ? (
            <ScrollView testID="native-scroll" style={{ flex: 1 }}>
              <View style={{ height: 120 }} />
              <View style={{ height: 240 }}>{nativeView}</View>
              <View style={{ height: 600 }} />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>{nativeView}</View>
          )
        ) : null}
        {overlay ? (
          <View
            testID="native-view-overlay"
            style={{
              position: 'absolute',
              top: 32,
              left: 32,
              right: 32,
              height: 100,
              borderRadius: 12,
              backgroundColor: '#d946ef',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 22, color: '#fff' }}>
              React Native above the native view
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
