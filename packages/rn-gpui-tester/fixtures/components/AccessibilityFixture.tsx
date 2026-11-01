import React, { useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
function AccessibilityFixture({ duplicate = false }: { duplicate?: boolean }) {
  const [invalid, setInvalid] = useState(false);
  return (
    <View style={styles.page}>
      <Text nativeID="document-label" style={styles.label}>
        Save document
      </Text>
      <Pressable
        testID="save"
        accessible
        accessibilityRole="button"
        accessibilityLabelledBy="document-label"
        accessibilityHint="Writes changes to disk"
        accessibilityActions={[
          {
            name: 'activate',
          },
        ]}
        onPress={() => setInvalid(true)}
      >
        <Text style={styles.button}>Save</Text>
      </Pressable>
      <Pressable
        testID="announce"
        onPress={() =>
          AccessibilityInfo.announceForAccessibility('Announcement API works')
        }
      >
        <Text style={styles.button}>Announce</Text>
      </Pressable>
      <View
        testID="switch"
        accessible
        accessibilityRole="switch"
        accessibilityLabel="Notifications"
        accessibilityState={{
          checked: true,
          selected: true,
        }}
      >
        <Text style={styles.label}>Enabled</Text>
      </View>
      <Pressable
        testID="disabled"
        accessible
        accessibilityRole="button"
        accessibilityLabel="Unavailable"
        disabled
        accessibilityState={{
          disabled: true,
        }}
      >
        <Text style={styles.disabled}>Disabled</Text>
      </Pressable>
      <View
        testID="progress"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Upload"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: 67,
          text: '67 percent',
        }}
      />
      <TextInput
        testID="input"
        accessibilityLabel="Project name"
        defaultValue="Desktop"
        style={styles.input}
      />
      <Text testID="live" accessibilityLiveRegion="polite" style={styles.muted}>
        Live status
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text testID="hidden-a11y" style={styles.muted}>
          Hidden subtree
        </Text>
      </View>
      {duplicate ? (
        <>
          <Text testID="duplicate" style={styles.label}>
            First
          </Text>
          <Text testID="duplicate" style={styles.label}>
            Second
          </Text>
        </>
      ) : null}
      {invalid ? (
        <View
          testID="unnamed-button"
          accessible
          accessibilityRole="button"
          style={{
            height: 40,
          }}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 32,
    gap: 16,
    backgroundColor: '#15171f',
  },
  label: {
    color: '#f2f4f8',
    fontSize: 16,
  },
  button: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    color: '#8492ae',
    fontSize: 16,
  },
  muted: {
    color: '#bbc6d8',
    fontSize: 15,
  },
  input: {
    width: 280,
    padding: 10,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#6772e5',
  },
});
export default AccessibilityFixture;
