import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  manipulateAsync,
  SaveFormat,
} from '@react-native-gpui/image-manipulator';

const RED =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGklEQVR4AWP8z8DwnwEJMDGgASYGNMDEgAYAg9ECBvYVtPAAAAAASUVORK5CYII=';

async function rejection(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error as Error & { code?: string };
  }
  return null;
}

/**
 * Runs the image manipulator on a four-colour picture the e2e writes and shows
 * the avatar-style result, next to the clipping cases an avatar editor relies on.
 * The checks are lines of text; the pixels are read from screenshots.
 */
export function ImageManipulatorFixture({ source }: { source?: string }) {
  const [lines, setLines] = useState<Array<string>>([]);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      const input = source as string;

      const whole = await manipulateAsync(input, [], {
        format: SaveFormat.PNG,
      });
      record(
        `size ${whole.width === 400 && whole.height === 300 && whole.uri.startsWith('file://') ? 'ok' : `BAD ${JSON.stringify(whole)}`}`,
      );

      const cropped = await manipulateAsync(
        input,
        [{ crop: { originX: 0, originY: 0, width: 200, height: 150 } }],
        { format: SaveFormat.PNG },
      );
      record(
        `crop ${cropped.width === 200 && cropped.height === 150 ? 'ok' : `BAD ${JSON.stringify(cropped)}`}`,
      );

      const byWidth = await manipulateAsync(input, [
        { resize: { width: 100 } },
      ]);
      const exact = await manipulateAsync(input, [
        { resize: { width: 50, height: 50 } },
      ]);
      record(
        `resize ${byWidth.width === 100 && byWidth.height === 75 && exact.width === 50 && exact.height === 50 ? 'ok' : 'BAD'}`,
      );

      const turned = await manipulateAsync(input, [{ rotate: 90 }]);
      const flipped = await manipulateAsync(input, [{ flip: 'horizontal' }]);
      record(
        `rotate ${turned.width === 300 && turned.height === 400 && flipped.width === 400 ? 'ok' : 'BAD'}`,
      );

      const result = await manipulateAsync(
        input,
        [
          { crop: { originX: 100, originY: 50, width: 200, height: 200 } },
          { resize: { width: 256, height: 256 } },
        ],
        { compress: 0.8, format: SaveFormat.JPEG, base64: true },
      );
      record(
        `avatar ${result.width === 256 && result.height === 256 && result.base64?.startsWith('/9j/') && result.uri.endsWith('.jpg') ? 'ok' : `BAD ${JSON.stringify({ ...result, base64: result.base64?.slice(0, 8) })}`}`,
      );
      setAvatar(`data:image/jpeg;base64,${result.base64}`);

      const again = await manipulateAsync(
        `data:image/jpeg;base64,${result.base64}`,
        [{ resize: { width: 64 } }],
        { format: SaveFormat.PNG },
      );
      record(
        `dataUri ${again.width === 64 && again.height === 64 ? 'ok' : 'BAD'}`,
      );

      const missing = await rejection(() =>
        manipulateAsync(`${input}.missing`, []),
      );
      const outside = await rejection(() =>
        manipulateAsync(input, [
          { crop: { originX: 900, originY: 0, width: 10, height: 10 } },
        ]),
      );
      const unknown = await rejection(() =>
        manipulateAsync(input, [], { format: 'bmp' as SaveFormat }),
      );
      record(
        `errors ${missing && outside && unknown && missing.code === 'ERR_IMAGE_MANIPULATOR' ? 'ok' : 'BAD'}`,
      );
      record('done ok');
    })().catch(error => {
      if (!cancelled) {
        setLines(current => [...current, `FAILED ${(error as Error).message}`]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="manipulator-title" style={styles.title}>
        Image manipulator
      </Text>
      <View style={styles.row}>
        {avatar ? (
          <Image
            testID="manipulated-avatar"
            source={{ uri: avatar }}
            style={styles.avatar}
          />
        ) : null}
        <View testID="clip-pan" style={styles.clipBox}>
          <View style={styles.circle}>
            <Image
              source={{ uri: RED }}
              resizeMode="stretch"
              style={{
                width: 100,
                height: 100,
                transform: [{ translateX: -20 }, { scale: 1.5 }],
              }}
            />
          </View>
        </View>
      </View>
      {lines.map(line => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, gap: 6 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  line: { color: '#94a3b8', fontSize: 13, fontFamily: 'Courier' },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatar: { width: 128, height: 128 },
  clipBox: {
    width: 150,
    height: 150,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
  },
});
