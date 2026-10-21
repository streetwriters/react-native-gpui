/**
 * A small custom title bar so apps do not rebuild one.
 *
 * The bar is a drag region: pressing it moves the window and a double click
 * zooms (or minimizes, per the user's macOS setting). On macOS the traffic
 * lights stay visible above a transparent title bar, so the bar leaves room for
 * them; elsewhere it draws its own caption buttons, but only where the window
 * really is frameless — a Linux compositor can refuse the request and leave the
 * window manager's own title bar in place, and a second set of buttons beside it
 * would be a bug.
 *
 * @format
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { capabilities } from './index';
import { WindowControl } from './WindowControl';

export interface TitleBarProps {
  title?: string;
  trafficLightInset?: number;
  showCaptionButtons?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const CAPTION_BUTTONS = [
  { control: 'minimize' as const, label: '\u2013' },
  { control: 'maximize' as const, label: '\u25a1' },
  { control: 'close' as const, label: '\u00d7' },
];

export function TitleBar({
  title,
  trafficLightInset,
  showCaptionButtons,
  style,
  children,
}: TitleBarProps) {
  // `Platform.OS` is the host, reported by the desktop module, so it needs no
  // fallback: it is `macos`, `windows` or `linux` on a desktop build.
  const isMac = Platform.OS === 'macos';
  // A window that kept its native title bar already has buttons, so drawing a
  // second set would only ever be wrong. `clientDecorations` is the capability
  // that says whether the window is really frameless, which on Linux depends on
  // what the compositor granted.
  const frameless = capabilities().clientDecorations;
  const inset = trafficLightInset ?? (isMac ? 78 : 0);
  const captionButtons = showCaptionButtons ?? (frameless && !isMac);
  return (
    <View desktopDragRegion style={[styles.bar, { paddingLeft: inset }, style]}>
      {title != null ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.spacer} pointerEvents="box-none">
        {children}
      </View>
      {captionButtons
        ? CAPTION_BUTTONS.map(button => (
            <WindowControl
              key={button.control}
              action={button.control}
              testID={`titlebar-${button.control}`}
              style={({ hovered, pressed }) => [
                styles.captionButton,
                hovered && styles.captionButtonHovered,
                pressed && styles.captionButtonPressed,
              ]}
            >
              <Text style={styles.captionLabel}>{button.label}</Text>
            </WindowControl>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captionButton: {
    width: 34,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  captionButtonHovered: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  captionButtonPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
  },
  captionLabel: {
    fontSize: 13,
  },
});
