/**
 * Window and title-bar control.
 *
 * Opens a secondary window running `DesktopShellChild`, reports the window list
 * and state, and drives the title-bar methods. The custom-title-bar window is
 * opened with a transparent title bar so the drag region is exercised.
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  DesktopError,
  DesktopWindow,
  TitleBar,
  useDesktopWindow,
} from 'react-native-gpui/desktop';

const styles = {
  page: { padding: 20, gap: 10, backgroundColor: '#f4f5f7', flex: 1 },
  heading: { fontSize: 22, fontWeight: '700' as const, color: '#18212f' },
  row: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#243247',
  },
  button: {
    padding: 10,
    backgroundColor: '#dce9ff',
    borderRadius: 8,
    color: '#164a9b',
  },
};

function WindowControlFixture() {
  const win = useDesktopWindow();
  const [windows, setWindows] = useState<
    { windowId: number; component: string }[]
  >([]);
  const [state, setState] = useState('unknown');
  const [error, setError] = useState('');
  const [childId, setChildId] = useState<number | null>(null);
  const [closeRequests, setCloseRequests] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const all = await DesktopWindow.all();
      setWindows(
        all.map(entry => ({
          windowId: entry.id,
          component: entry.component ?? '',
        })),
      );
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribing to `closeRequested` is what makes the host intercept the OS
  // close button, so this is also the veto ("unsaved changes") path.
  useEffect(() => {
    const subscription = win.addListener('closeRequested', () => {
      setCloseRequests(count => count + 1);
    });
    return () => subscription.remove();
  }, [win]);

  const openChild = useCallback(async () => {
    try {
      const child = await DesktopWindow.open({
        component: 'DesktopShellChild',
        title: 'Child window',
        width: 420,
        height: 320,
        props: { label: 'from the parent' },
      });
      setChildId(child.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof DesktopError ? cause.message : String(cause));
    }
  }, [refresh]);

  const closeChild = useCallback(async () => {
    try {
      const target = childId ?? (await DesktopWindow.all()).at(-1)?.id;
      if (target != null && target !== win.id) {
        await new DesktopWindow(target).close();
      }
      setChildId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof DesktopError ? cause.message : String(cause));
    }
  }, [childId, refresh, win.id]);

  const readState = useCallback(async () => {
    try {
      const next = await win.getState();
      setState(JSON.stringify(next));
    } catch (cause) {
      setError(cause instanceof DesktopError ? cause.message : String(cause));
    }
  }, [win]);

  const openTitleBarWindow = useCallback(async () => {
    try {
      const child = await DesktopWindow.open({
        component: 'DesktopShellChild',
        title: 'Custom title bar',
        width: 520,
        height: 360,
        titleBar: 'transparent',
        trafficLightPosition: { x: 14, y: 14 },
        props: { label: 'transparent title bar' },
      });
      setChildId(child.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof DesktopError ? cause.message : String(cause));
    }
  }, [refresh]);

  return (
    <View style={styles.page}>
      <TitleBar title="Window control" />
      <Text style={styles.heading}>Windows</Text>
      <Text testID="desktop-window-id" style={styles.row}>
        this window: {win.id}
      </Text>
      <Text testID="desktop-window-count" style={styles.row}>
        open windows: {windows.length}
      </Text>
      <Text testID="desktop-window-list" style={styles.row}>
        {windows.map(entry => `${entry.windowId}:${entry.component}`).join(',')}
      </Text>
      <Text testID="window-close-requests" style={styles.row}>
        closeRequested: {closeRequests}
      </Text>
      <Text testID="desktop-window-state" style={styles.row}>
        state: {state}
      </Text>
      {error ? (
        <Text testID="desktop-window-error" style={styles.row}>
          error: {error}
        </Text>
      ) : null}
      <Pressable testID="desktop-open-window" onPress={openChild}>
        <Text style={styles.button}>Open a second window</Text>
      </Pressable>
      <Pressable
        testID="desktop-open-titlebar-window"
        onPress={openTitleBarWindow}
      >
        <Text style={styles.button}>Open a custom title bar window</Text>
      </Pressable>
      <Pressable testID="desktop-close-window" onPress={closeChild}>
        <Text style={styles.button}>Close the second window</Text>
      </Pressable>
      <Pressable testID="desktop-read-state" onPress={readState}>
        <Text style={styles.button}>Read window state</Text>
      </Pressable>
      <Pressable
        testID="desktop-set-title"
        onPress={() => {
          win.setTitle('Renamed by JS');
        }}
      >
        <Text style={styles.button}>Set title</Text>
      </Pressable>
      <Pressable
        testID="desktop-set-size"
        onPress={() => {
          win.setSize({ width: 900, height: 640 });
        }}
      >
        <Text style={styles.button}>Set size 900x640</Text>
      </Pressable>
      <Pressable
        testID="desktop-set-position"
        onPress={() => {
          win.setPosition({ x: 120, y: 120 }).catch(() => {});
        }}
      >
        <Text style={styles.button}>Set position</Text>
      </Pressable>
      <Pressable
        testID="desktop-toggle-fullscreen"
        onPress={() => {
          win.getState().then(next => win.setFullscreen(!next.isFullscreen));
        }}
      >
        <Text style={styles.button}>Toggle fullscreen</Text>
      </Pressable>
      <Pressable
        testID="desktop-always-on-top"
        onPress={() => {
          win.setAlwaysOnTop(true).catch(() => {});
        }}
      >
        <Text style={styles.button}>Always on top</Text>
      </Pressable>
    </View>
  );
}

export default WindowControlFixture;
