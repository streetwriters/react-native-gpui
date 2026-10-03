import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

const COLORS = ['#9d89ff', '#60ddff', '#f69ed2', '#a6f6cc'];
const TAU = Math.PI * 2;

function Satellite({
  index,
  phase,
  energy,
  radius,
}: {
  index: number;
  phase: SharedValue<number>;
  energy: SharedValue<number>;
  radius: number;
}) {
  const motion = useAnimatedStyle(() => {
    const angle = phase.value * TAU + (index * TAU) / 8;
    const depth = (Math.sin(angle) + 1) / 2;
    const orbit = radius * (1 + energy.value * 0.2);
    return {
      opacity: 0.4 + depth * 0.6,
      transform: [
        { translateX: Math.cos(angle) * orbit },
        { translateY: Math.sin(angle) * orbit * 0.42 },
        { scale: 0.6 + depth * 0.6 + energy.value * 0.15 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.satellite,
        { backgroundColor: COLORS[index % COLORS.length] },
        motion,
      ]}
    />
  );
}

function SignalBar({
  index,
  phase,
  energy,
}: {
  index: number;
  phase: SharedValue<number>;
  energy: SharedValue<number>;
}) {
  const motion = useAnimatedStyle(() => {
    const wave = (Math.sin(phase.value * TAU * 3 + index * 0.48) + 1) / 2;
    return {
      opacity: 0.45 + wave * 0.55,
      transform: [{ scaleY: 0.18 + wave * 0.75 + energy.value * 0.15 }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.signalBar,
        { backgroundColor: index % 3 === 0 ? '#60ddff' : '#9d89ff' },
        motion,
      ]}
    />
  );
}

export default function ReanimatedDemo(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const [jsBusy, setJsBusy] = useState(false);
  const [heartbeat, setHeartbeat] = useState(0);
  const phase = useSharedValue(0);
  const energy = useSharedValue(0);
  const scroll = useSharedValue(0);
  const wide = width >= 1050;
  const contentWidth = Math.min(
    wide ? 1440 : 820,
    Math.max(280, width - (wide ? 112 : 56)),
  );
  const stageWidth = wide ? (contentWidth - 48) * 0.58 : contentWidth;
  const radius = Math.min(wide ? 210 : 170, stageWidth * 0.3);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.linear }),
      -1,
      false,
    );
    const interval = setInterval(() => setHeartbeat(value => value + 1), 1000);
    return () => {
      clearInterval(interval);
      cancelAnimation(phase);
      cancelAnimation(energy);
    };
  }, [energy, phase]);

  const coreMotion = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      energy.value,
      [0, 1],
      ['#8b74ff', '#60ddff'],
    ),
    transform: [
      {
        scale: 1 + Math.sin(phase.value * TAU * 2) * 0.035 + energy.value * 0.2,
      },
    ],
  }));
  const haloMotion = useAnimatedStyle(() => ({
    opacity: 0.12 + energy.value * 0.13,
    transform: [
      {
        scale: 1 + Math.sin(phase.value * TAU * 2) * 0.08 + energy.value * 0.3,
      },
    ],
  }));
  const ringMotion = useAnimatedStyle(() => ({
    opacity: 0.3 + energy.value * 0.45,
    transform: [{ scale: 1 + energy.value * 0.32 }],
  }));
  const scrollHandler = useAnimatedScrollHandler(event => {
    scroll.value = Math.min(1, Math.max(0, event.contentOffset.y / 160));
  });
  const remixMotion = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      scroll.value,
      [0, 1],
      ['#9d89ff', '#a6f6cc'],
    ),
    transform: [
      { translateX: scroll.value * Math.max(80, contentWidth - 130) },
      { scale: 0.85 + scroll.value * 0.3 },
    ],
  }));

  const pulse = () => {
    scheduleOnUI(() => {
      'worklet';
      energy.value = withSequence(
        withSpring(1, { damping: 9, stiffness: 140 }),
        withSpring(0, { damping: 12, stiffness: 75 }),
      );
    });
  };
  const pauseJS = () => {
    setJsBusy(true);
    pulse();
    setTimeout(() => {
      console.log('[reanimated-demo] JS busy started');
      const finishAt = Date.now() + 3000;
      while (Date.now() < finishAt) {
        // Explicit demo: all ongoing motion and scroll worklets stay on the UI runtime.
      }
      console.log('[reanimated-demo] JS busy finished');
      setJsBusy(false);
    }, 100);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.page, wide && styles.pageWide]}
    >
      <View style={[styles.content, { width: contentWidth }]}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <View style={styles.brandDot} />
            </View>
            <Text style={[styles.brandText, wide && styles.brandTextWide]}>
              react-native-gpui
            </Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>DESKTOP PREVIEW</Text>
          </View>
        </View>

        <View style={[styles.main, wide && styles.mainWide]}>
          <View style={[styles.intro, wide && styles.introWide]}>
            <Text style={styles.eyebrow}>A NEW HOME FOR REACT NATIVE</Text>
            <Text
              style={[
                styles.title,
                wide && styles.titleWide,
                width < 550 && styles.titleCompact,
              ]}
            >
              {wide ? 'Desktop.\nIn motion.' : 'Desktop. In motion.'}
            </Text>
            <Text style={[styles.subtitle, wide && styles.subtitleWide]}>
              React Native + Rust + GPUI.{'\n'}Reanimated & Worklets, running on
              the UI thread.
            </Text>

            <View style={styles.techTags}>
              <View style={styles.techTag}>
                <Text style={styles.techTagText}>REANIMATED 4</Text>
              </View>
              <View style={styles.techTag}>
                <Text style={styles.techTagText}>WORKLETS</Text>
              </View>
            </View>
            <View style={styles.controls}>
              <Pressable style={styles.primaryButton} onPress={pulse}>
                <Text style={styles.primaryButtonText}>Pulse the system ↗</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={pauseJS}
                disabled={jsBusy}
              >
                <Text style={styles.secondaryButtonText}>
                  {jsBusy
                    ? 'JS paused. UI keeps moving.'
                    : 'Pause JavaScript for 3s'}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={{ width: stageWidth }}>
            <View style={styles.stage}>
              <View style={styles.stageHeader}>
                <Text style={styles.stageLabel}>01 / ORBIT</Text>
                <Text style={styles.stageHint}>NATIVE MOTION</Text>
              </View>
              <View style={[styles.orbitField, wide && styles.orbitFieldWide]}>
                <View style={[styles.orbitTrack, { width: radius * 2 + 22 }]} />
                <View style={styles.crosshairHorizontal} />
                <View style={styles.crosshairVertical} />
                <Animated.View
                  style={[styles.halo, wide && styles.haloWide, haloMotion]}
                />
                <Animated.View
                  style={[
                    styles.coreRing,
                    wide && styles.coreRingWide,
                    ringMotion,
                  ]}
                />
                <Animated.View
                  style={[styles.core, wide && styles.coreWide, coreMotion]}
                />
                <View style={styles.coreShine} />
                {Array.from({ length: 8 }, (_, index) => (
                  <Satellite
                    key={index}
                    index={index}
                    phase={phase}
                    energy={energy}
                    radius={radius}
                  />
                ))}
              </View>
              <View style={[styles.signal, wide && styles.signalWide]}>
                {Array.from({ length: 22 }, (_, index) => (
                  <SignalBar
                    key={index}
                    index={index}
                    phase={phase}
                    energy={energy}
                  />
                ))}
              </View>
              <View style={styles.stageFooter}>
                <Text style={styles.footerLabel}>ONE SHARED CLOCK</Text>
                <Text style={styles.footerValue}>
                  translate · scale · color · opacity
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.remixCard}>
          <View style={styles.stageHeader}>
            <Text style={styles.stageLabel}>02 / SCROLL TO REMIX</Text>
            <Text style={styles.stageHint}>UI WORKLET</Text>
          </View>
          <View style={styles.remixTrack}>
            <Animated.View style={[styles.remixKnob, remixMotion]} />
          </View>
          <Animated.ScrollView
            style={styles.remixScroll}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.remixRows}
          >
            {[
              'Scroll here to change the signal.',
              'Same JavaScript. A native desktop.',
              'A dedicated UI runtime.',
              'Your next app, in motion.',
              'Built for the desktop.',
            ].map((label, index) => (
              <View key={label} style={styles.remixRow}>
                <Text style={styles.remixNumber}>0{index + 1}</Text>
                <Text style={styles.remixText}>{label}</Text>
                <Text style={styles.remixArrow}>↓</Text>
              </View>
            ))}
          </Animated.ScrollView>
        </View>

        <View style={styles.bottomLine}>
          <Text style={styles.bottomText}>REANIMATED 4 + WORKLETS</Text>
          <Text style={[styles.jsStatus, jsBusy && styles.jsStatusBusy]}>
            {jsBusy
              ? 'JS PAUSED / UI LIVE'
              : `JS heartbeat ${String(heartbeat).padStart(2, '0')}`}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080b13' },
  page: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 24,
  },
  content: { maxWidth: 1440 },
  pageWide: { paddingHorizontal: 56, paddingTop: 40, paddingBottom: 32 },
  main: { marginBottom: 18 },
  mainWide: {
    flexDirection: 'row',
    gap: 48,
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 28,
  },
  intro: {},
  introWide: { flex: 1 },
  titleWide: { fontSize: 78, lineHeight: 83, letterSpacing: -3.8 },
  subtitleWide: { fontSize: 17, lineHeight: 28, marginTop: 22 },
  brandTextWide: { fontSize: 19 },
  orbitFieldWide: { height: 300 },
  haloWide: { width: 196, height: 196, borderRadius: 98 },
  coreRingWide: { width: 136, height: 136, borderRadius: 68 },
  coreWide: { width: 96, height: 96, borderRadius: 48 },
  signalWide: { height: 60, marginBottom: 16 },
  techTags: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  techTag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#302b48',
    borderRadius: 6,
    backgroundColor: '#171428',
  },
  techTagText: {
    color: '#b8a9ef',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: {
    width: 23,
    height: 23,
    borderRadius: 7,
    backgroundColor: '#9d89ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: '#080b13',
  },
  brandText: {
    color: '#f0efff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#12221e',
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 20,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a6f6cc' },
  liveText: {
    color: '#a6f6cc',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  eyebrow: {
    color: '#9d89ff',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  title: {
    color: '#f4f3ff',
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.8,
  },
  titleCompact: { fontSize: 34, letterSpacing: -1.2 },
  subtitle: {
    color: '#8e97ae',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 24,
  },
  stage: {
    borderWidth: 1,
    borderColor: '#242b42',
    borderRadius: 20,
    backgroundColor: '#101522',
    overflow: 'hidden',
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 15,
  },
  stageLabel: {
    color: '#c3c9de',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.3,
  },
  stageHint: { color: '#67718b', fontSize: 8, letterSpacing: 1.1 },
  orbitField: { height: 200, alignItems: 'center', justifyContent: 'center' },
  orbitTrack: {
    position: 'absolute',
    height: 144,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#262c47',
  },
  crosshairHorizontal: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: '#1b2235',
  },
  crosshairVertical: {
    position: 'absolute',
    top: 16,
    bottom: 16,
    width: 1,
    backgroundColor: '#1b2235',
  },
  halo: {
    position: 'absolute',
    width: 154,
    height: 154,
    borderRadius: 77,
    backgroundColor: '#8b74ff',
  },
  coreRing: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: '#9d89ff',
  },
  core: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#8b74ff' },
  coreShine: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -18,
    marginTop: -20,
    backgroundColor: '#c4b8ff',
    opacity: 0.45,
  },
  satellite: { position: 'absolute', width: 18, height: 18, borderRadius: 6 },
  signal: {
    height: 45,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  signalBar: { width: 5, height: 40, borderRadius: 3 },
  stageFooter: {
    borderTopWidth: 1,
    borderTopColor: '#20263a',
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLabel: { color: '#66718d', fontSize: 8, letterSpacing: 1.1 },
  footerValue: { color: '#a1aac2', fontSize: 9 },
  controls: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 18 },
  primaryButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#aa97ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#18112e', fontSize: 11, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a3249',
    backgroundColor: '#111726',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#c0c7db', fontSize: 10, fontWeight: '500' },
  remixCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232b41',
    backgroundColor: '#0e1421',
    overflow: 'hidden',
  },
  remixTrack: {
    height: 34,
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 7,
    borderRadius: 8,
    backgroundColor: '#1b2336',
    justifyContent: 'center',
  },
  remixKnob: { width: 50, height: 22, borderRadius: 6, marginLeft: 6 },
  remixScroll: { height: 70 },
  remixRows: { paddingHorizontal: 18, paddingBottom: 8 },
  remixRow: {
    height: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e263a',
  },
  remixNumber: { color: '#66718e', fontSize: 10, fontWeight: '600' },
  remixText: { flex: 1, color: '#a7b0c8', fontSize: 11 },
  remixArrow: { color: '#9d89ff', fontSize: 13 },
  bottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 17,
  },
  bottomText: { color: '#5e6984', fontSize: 8, letterSpacing: 1.2 },
  jsStatus: { color: '#8895b3', fontSize: 9 },
  jsStatusBusy: { color: '#a6f6cc' },
});
