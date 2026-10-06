import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
function AccessibilityFixture({ duplicate = false }: { duplicate?: boolean }) {
  const [invalid, setInvalid] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        padding: 32,
        gap: 16,
      }}
    >
      <Text nativeID="document-label">Save document</Text>
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
        <Text>Save</Text>
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
        <Text>Enabled</Text>
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
        <Text>Disabled</Text>
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
      />
      <Text testID="live" accessibilityLiveRegion="polite">
        Live status
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text testID="hidden-a11y">Hidden subtree</Text>
      </View>
      {duplicate ? (
        <>
          <Text testID="duplicate">First</Text>
          <Text testID="duplicate">Second</Text>
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
export default AccessibilityFixture;
