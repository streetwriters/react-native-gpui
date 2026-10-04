import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppRegistry,
  Image,
  findNodeHandle,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

function AccessibilityProbe() {
  const saveButton = useRef<React.ElementRef<typeof Pressable>>(null);
  const firstTab = useRef<React.ElementRef<typeof Pressable>>(null);
  const [checked, setChecked] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [announcement, setAnnouncement] = useState('No actions yet');
  const [modalOpen, setModalOpen] = useState(false);
  const [accessibilityInfo, setAccessibilityInfo] = useState(
    'Checking platform APIs…',
  );
  const [accessibilityChanges, setAccessibilityChanges] = useState(
    'No setting changes received',
  );

  useEffect(() => {
    Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      AccessibilityInfo.isScreenReaderEnabled(),
      AccessibilityInfo.getRecommendedTimeoutMillis(1200),
    ])
      .then(([reduceMotion, screenReader, timeout]) => {
        setAccessibilityInfo(
          `reduce motion: ${reduceMotion}; screen reader: ${screenReader}; timeout: ${timeout}ms`,
        );
      })
      .catch(error =>
        setAccessibilityInfo(`AccessibilityInfo error: ${String(error)}`),
      );
  }, []);

  useEffect(() => {
    const subscriptions = [
      AccessibilityInfo.addEventListener('reduceMotionChanged', value =>
        setAccessibilityChanges(`reduce motion changed: ${value}`),
      ),
      AccessibilityInfo.addEventListener('reduceTransparencyChanged', value =>
        setAccessibilityChanges(`reduce transparency changed: ${value}`),
      ),
      AccessibilityInfo.addEventListener('darkerSystemColorsChanged', value =>
        setAccessibilityChanges(`increase contrast changed: ${value}`),
      ),
      AccessibilityInfo.addEventListener('invertColorsChanged', value =>
        setAccessibilityChanges(`invert colors changed: ${value}`),
      ),
      AccessibilityInfo.addEventListener('screenReaderChanged', value =>
        setAccessibilityChanges(`screen reader changed: ${value}`),
      ),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const tag = findNodeHandle(saveButton.current);
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const host = saveButton.current;
      if (host != null) AccessibilityInfo.sendAccessibilityEvent(host, 'focus');
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const host = saveButton.current;
      if (host != null) AccessibilityInfo.sendAccessibilityEvent(host, 'click');
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const tag = findNodeHandle(firstTab.current);
      if (tag != null) {
        AccessibilityInfo.setAccessibilityFocus(tag);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.info('[AccessibilityProbe] opening modal dialog');
      setModalOpen(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ScrollView
      accessibilityLabel="Accessibility examples"
      style={{ flex: 1, backgroundColor: '#101827' }}
      contentContainerStyle={{ padding: 28, gap: 14 }}
    >
      <Text style={{ color: 'white', fontSize: 24, fontWeight: '700' }}>
        Accessibility props probe
      </Text>
      <Text testID="a11y-info-result" style={{ color: '#fcd34d' }}>
        {accessibilityInfo}
      </Text>
      <Text testID="a11y-setting-changes" style={{ color: '#fcd34d' }}>
        {accessibilityChanges}
      </Text>
      <Text
        nativeID="a11y-save-label"
        accessibilityLanguage="en-US"
        style={{ color: '#dbeafe', fontSize: 16 }}
      >
        Save the current document
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Upload progress"
        accessibilityValue={{ min: 0, max: 100, now: 67, text: '67 percent' }}
        style={{ padding: 10, backgroundColor: '#1e3a8a', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>Upload progress: 67%</Text>
      </View>
      <View
        accessible
        accessibilityRole="group"
        accessibilityLabel="Expanded settings"
        accessibilityState={{ expanded: true, busy: false }}
        accessibilityRespondsToUserInteraction
        style={{ padding: 10, backgroundColor: '#1f2937', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>
          Group with expanded and busy state
        </Text>
      </View>
      <Pressable
        testID="a11y-save-button"
        nativeID="a11y-save-action"
        ref={saveButton}
        accessible
        accessibilityRole="button"
        accessibilityLabelledBy={['a11y-save-label']}
        accessibilityHint="Saves your changes to this document"
        accessibilityActions={[
          { name: 'activate', label: 'Save' },
          { name: 'customSave', label: 'Save a copy' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          setActionCount(count => count + 1);
          setAnnouncement(`Last action: ${nativeEvent.actionName}`);
        }}
        onPress={() => {
          console.info(
            '[AccessibilityProbe] Fabric accessibility click reached onPress',
          );
          setActionCount(count => count + 1);
          setAnnouncement('Fabric accessibility click activated Save');
        }}
        onAccessibilityTap={() => setAnnouncement('Accessibility tap received')}
        style={{ padding: 14, backgroundColor: '#2563eb', borderRadius: 8 }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Save</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Move accessibility focus to Save"
        onPress={() => {
          const tag = findNodeHandle(saveButton.current);
          if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
        }}
        style={{ padding: 12, backgroundColor: '#475569', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>
          Request accessibility focus on Save
        </Text>
      </Pressable>
      <Text
        testID="a11y-live"
        accessibilityLiveRegion="polite"
        style={{ color: '#a7f3d0' }}
      >
        {announcement} · actions: {actionCount}
      </Text>
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Example tabs"
        style={{ flexDirection: 'row', gap: 8 }}
      >
        {['Overview', 'Settings'].map((label, index) => (
          <Pressable
            key={label}
            ref={index === 0 ? firstTab : undefined}
            accessible
            onFocus={() =>
              console.info(`[AccessibilityProbe] tab focused ${label}`)
            }
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedTab === index }}
            onPress={() => {
              setSelectedTab(index);
              if (index === 1) {
                console.info(
                  '[AccessibilityProbe] arrow key selected Settings tab',
                );
              }
            }}
            style={{
              padding: 10,
              backgroundColor: selectedTab === index ? '#2563eb' : '#475569',
              borderRadius: 6,
            }}
          >
            <Text style={{ color: 'white' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text testID="a11y-selected-tab" style={{ color: '#dbeafe' }}>
        Selected tab: {selectedTab === 0 ? 'Overview' : 'Settings'}
      </Text>
      <View
        testID="a11y-switch"
        accessible
        accessibilityRole="switch"
        accessibilityLabel="Enable notifications"
        accessibilityState={{ checked, selected: checked, disabled: false }}
        onTouchEnd={() => setChecked(value => !value)}
        style={{
          width: 220,
          padding: 8,
          backgroundColor: '#064e3b',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: 'white' }}>
          Notification switch: {checked ? 'on' : 'off'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="System switch"
        accessibilityState={{ checked }}
        onPress={() => setChecked(value => !value)}
        style={{ padding: 12, backgroundColor: '#065f46', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>
          Toggle switch: {checked ? 'on' : 'off'}
        </Text>
      </Pressable>
      <Pressable
        testID="a11y-disabled-button"
        accessible
        disabled
        accessibilityRole="button"
        accessibilityLabel="Unavailable action"
        accessibilityState={{ disabled: true }}
        style={{ padding: 12, backgroundColor: '#4b5563', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>Unavailable</Text>
      </Pressable>
      <View
        accessible
        accessibilityRole="group"
        style={{ padding: 12, backgroundColor: '#1f2937' }}
      >
        <Text style={{ color: 'white' }}>Grouped child label</Text>
        <Text style={{ color: '#cbd5e1' }}>Grouped child description</Text>
      </View>
      <View role="list" accessibilityLabel="Static list">
        <Text
          role="listitem"
          testID="a11y-list-first"
          style={{ color: 'white' }}
        >
          First list item
        </Text>
        <Text
          role="listitem"
          testID="a11y-list-second"
          style={{ color: 'white' }}
        >
          Second list item
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text testID="a11y-hidden-descendant" style={{ color: 'white' }}>
          This subtree is hidden from assistive technology
        </Text>
      </View>
      <View importantForAccessibility="no">
        <Text style={{ color: '#cbd5e1' }}>
          This wrapper is ignored while its child remains exposed
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Toggle modal accessibility example"
        accessibilityRole="button"
        onPress={() => setModalOpen(value => !value)}
        style={{ padding: 12, backgroundColor: '#334155', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>
          {modalOpen ? 'Close' : 'Open'} modal accessibility example
        </Text>
      </Pressable>
      {modalOpen ? (
        <View
          accessibilityViewIsModal
          accessible
          role="dialog"
          onAccessibilityEscape={() => {
            console.info('[AccessibilityProbe] modal escape closed dialog');
            setModalOpen(false);
          }}
          accessibilityLabel="Example modal dialog"
          style={{ padding: 16, backgroundColor: '#7f1d1d', borderRadius: 8 }}
        >
          <Text style={{ color: 'white' }}>Modal subtree is active</Text>
          <Pressable
            accessibilityLabel="First modal action"
            onFocus={() =>
              console.info('[AccessibilityProbe] first modal action focused')
            }
            onPress={() => setAnnouncement('First modal action')}
          >
            <Text style={{ color: 'white' }}>First action</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Close modal dialog"
            onFocus={() =>
              console.info('[AccessibilityProbe] close modal action focused')
            }
            onPress={() => setModalOpen(false)}
          >
            <Text style={{ color: 'white' }}>Close dialog</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        testID="a11y-text-input"
        accessibilityLabel="Project name"
        accessibilityHint="Enter a short project name"
        placeholder="Project name"
        defaultValue="Desktop app"
        style={{
          color: 'white',
          borderWidth: 1,
          borderColor: '#64748b',
          padding: 10,
        }}
      />
      <TextInput
        testID="a11y-password-input"
        accessibilityLabel="Account password"
        secureTextEntry
        defaultValue="secret-not-exposed"
        style={{
          color: 'white',
          borderWidth: 1,
          borderColor: '#64748b',
          padding: 10,
        }}
      />
      <Image
        accessible
        accessibilityLabel="Decorative blue square example"
        accessibilityIgnoresInvertColors
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle="Blue square example"
        source={require('../assets/image-probe.png')}
        style={{ width: 48, height: 48 }}
      />
      <Pressable
        onPress={() =>
          AccessibilityInfo.announceForAccessibility('Announcement API works')
        }
        style={{ padding: 12, backgroundColor: '#7c3aed', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>Announce test phrase</Text>
      </Pressable>
    </ScrollView>
  );
}

AppRegistry.registerComponent('AccessibilityProbe', () => AccessibilityProbe);

export default AccessibilityProbe;
